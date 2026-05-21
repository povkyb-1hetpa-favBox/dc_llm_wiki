import { readFile, writeFile } from "@/commands/fs"
import { autoIngest } from "./ingest"
import { useWikiStore } from "@/stores/wiki-store"
import { normalizePath, isAbsolutePath } from "@/lib/path-utils"
import { getProjectPathById } from "@/lib/project-identity"
import { hasUsableLlm } from "@/lib/has-usable-llm"

// ── Types ─────────────────────────────────────────────────────────────────

export interface IngestTask {
  id: string
  /** Stable project UUID (see project-identity.ts). Prefer this to
   *  `projectPath` because the filesystem location can change — tasks
   *  look up the current path via the registry at run time. */
  projectId: string
  sourcePath: string // relative to project: "raw/sources/folder/file.pdf"
  folderContext: string // e.g. "AI-Research > papers" or ""
  status: "pending" | "processing" | "done" | "failed"
  addedAt: number
  error: string | null
  retryCount: number
}

// ── State ─────────────────────────────────────────────────────────────────

let queue: IngestTask[] = []
let activeWorkers = 0
const MAX_CONCURRENCY = 2

/** UUID of the currently-active project. Used as a stale-context guard
 *  in processNext: if this changes mid-ingest (user switched projects),
 *  the orphaned runner bails instead of writing to the old project. */
let currentProjectId = ""
/** Cached filesystem path of the currently-active project. Kept in lock-
 *  step with `currentProjectId` by pauseQueue / restoreQueue so sync
 *  callers (saveQueue, cancelTask, etc.) don't need a registry lookup. */
let currentProjectPath = ""

// Map to track abort controllers per task
const abortControllers = new Map<string, AbortController>()

// Track whether any task has been processed since the last drain.
// Prevents the sweep from running on every idle/no-op call.
let processedSinceDrain = false
// Abort controller for the review-sweep LLM call so switching projects
// cancels a long-running judgment instead of burning tokens.
let sweepAbortController: AbortController | null = null

// ── Persistence ───────────────────────────────────────────────────────────

function queueFilePath(projectPath: string): string {
  return `${normalizePath(projectPath)}/.llm-wiki/ingest-queue.json`
}

async function saveQueue(projectPath: string): Promise<void> {
  try {
    // Only save pending and failed tasks (done tasks are removed)
    const toSave = queue.filter((t) => t.status !== "done")
    await writeFile(queueFilePath(projectPath), JSON.stringify(toSave, null, 2))
  } catch {
    // non-critical
  }
}

async function loadQueue(
  projectPath: string,
  projectId: string,
): Promise<IngestTask[]> {
  try {
    const raw = await readFile(queueFilePath(projectPath))
    const tasks = JSON.parse(raw) as IngestTask[]
    // Backfill projectId for tasks persisted before the field existed.
    // Files live inside a specific project, so every task in this file
    // belongs to `projectId` regardless of what's on disk.
    return tasks.map((t) => ({
      ...t,
      projectId: t.projectId ?? projectId,
    }))
  } catch {
    return []
  }
}

// ── Queue Operations ──────────────────────────────────────────────────────

function generateId(): string {
  return `ingest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeSourcePathForQueue(sourcePath: string): string {
  const normalized = normalizePath(sourcePath)
  if (currentProjectPath && normalized.startsWith(`${currentProjectPath}/`)) {
    return normalized.slice(currentProjectPath.length + 1)
  }
  return normalized
}

function sameQueuedSourcePath(a: string, b: string): boolean {
  return normalizeSourcePathForQueue(a) === normalizeSourcePathForQueue(b)
}

function upsertQueuedIngestTask(
  projectId: string,
  sourcePath: string,
  folderContext: string,
): string {
  const normalizedSourcePath = normalizeSourcePathForQueue(sourcePath)
  const pendingOrFailed = queue.find(
    (t) =>
      t.projectId === projectId &&
      (t.status === "pending" || t.status === "failed") &&
      sameQueuedSourcePath(t.sourcePath, normalizedSourcePath),
  )

  if (pendingOrFailed) {
    pendingOrFailed.sourcePath = normalizedSourcePath
    pendingOrFailed.folderContext = folderContext || pendingOrFailed.folderContext
    pendingOrFailed.status = "pending"
    pendingOrFailed.error = null
    pendingOrFailed.retryCount = 0
    return pendingOrFailed.id
  }

  const processing = queue.find(
    (t) =>
      t.projectId === projectId &&
      t.status === "processing" &&
      sameQueuedSourcePath(t.sourcePath, normalizedSourcePath),
  )
  const pendingRerun = processing
    ? queue.find(
        (t) =>
          t.projectId === projectId &&
          t.status === "pending" &&
          sameQueuedSourcePath(t.sourcePath, normalizedSourcePath),
      )
    : null

  if (pendingRerun) {
    return pendingRerun.id
  }

  const task: IngestTask = {
    id: generateId(),
    projectId,
    sourcePath: normalizedSourcePath,
    folderContext,
    status: "pending",
    addedAt: Date.now(),
    error: null,
    retryCount: 0,
  }
  queue.push(task)
  return task.id
}

/**
 * Delete files written by a cancelled / failed ingest, AND drop the
 * matching pages' chunks from LanceDB. Called from the cancel paths
 * (cancelTask, cancelAllTasks).
 */
export async function cleanupWrittenFiles(
  projectPath: string,
  filePaths: string[],
): Promise<void> {
  const { cascadeDeleteWikiPage } = await import("@/lib/wiki-page-delete")
  for (const filePath of filePaths) {
    const fullPath = isAbsolutePath(filePath)
      ? normalizePath(filePath)
      : `${projectPath}/${filePath}`
    try {
      await cascadeDeleteWikiPage(projectPath, fullPath)
    } catch {
      // file may not exist / lancedb unavailable — non-critical
    }
  }
}

export async function enqueueIngest(
  projectId: string,
  sourcePath: string,
  folderContext: string = "",
): Promise<string> {
  if (!currentProjectId || currentProjectId !== projectId) {
    throw new Error(
      `enqueueIngest: project ${projectId} is not the active project`,
    )
  }

  const id = upsertQueuedIngestTask(projectId, sourcePath, folderContext)
  await saveQueue(currentProjectPath)
  processNext(currentProjectId)
  return id
}

export async function enqueueBatch(
  projectId: string,
  files: Array<{ sourcePath: string; folderContext: string }>,
): Promise<string[]> {
  if (!currentProjectId || currentProjectId !== projectId) {
    throw new Error(`enqueueBatch: project ${projectId} is not the active project`)
  }

  const ids: string[] = []
  for (const file of files) {
    ids.push(upsertQueuedIngestTask(projectId, file.sourcePath, file.folderContext))
  }

  await saveQueue(currentProjectPath)
  processNext(currentProjectId)
  return ids
}

export async function retryTask(taskId: string): Promise<void> {
  const task = queue.find((t) => t.id === taskId)
  if (!task || task.projectId !== currentProjectId) return

  task.status = "pending"
  task.error = null
  await saveQueue(currentProjectPath)
  processNext(currentProjectId)
}

export async function cancelTask(taskId: string): Promise<void> {
  const task = queue.find((t) => t.id === taskId)
  if (!task || task.projectId !== currentProjectId) return

  const controller = abortControllers.get(taskId)
  if (controller) {
    controller.abort()
    abortControllers.delete(taskId)
  }

  queue = queue.filter((t) => t.id !== taskId)
  await saveQueue(currentProjectPath)
  processNext(currentProjectId)
}

export async function clearCompletedTasks(): Promise<void> {
  queue = queue.filter((t) => t.status === "pending" || t.status === "processing")
  await saveQueue(currentProjectPath)
}

export async function cancelAllTasks(): Promise<number> {
  for (const controller of abortControllers.values()) {
    controller.abort()
  }
  abortControllers.clear()
  activeWorkers = 0

  const before = queue.length
  queue = queue.filter((t) => t.status === "failed")
  const removed = before - queue.length

  await saveQueue(currentProjectPath)
  return removed
}

export function getQueue(): readonly IngestTask[] {
  return queue
}

export function getQueueSummary() {
  return {
    pending: queue.filter((t) => t.status === "pending").length,
    processing: queue.filter((t) => t.status === "processing").length,
    failed: queue.filter((t) => t.status === "failed").length,
    total: queue.length,
  }
}

export function clearQueueState(): void {
  for (const controller of abortControllers.values()) {
    controller.abort()
  }
  abortControllers.clear()
  if (sweepAbortController) {
    sweepAbortController.abort()
  }
  queue = []
  activeWorkers = 0
  currentProjectId = ""
  currentProjectPath = ""
  sweepAbortController = null
  processedSinceDrain = false
}

export async function pauseQueue(): Promise<void> {
  if (!currentProjectId || !currentProjectPath) return

  const pausedProjectPath = currentProjectPath
  for (const controller of abortControllers.values()) {
    controller.abort()
  }
  abortControllers.clear()

  if (sweepAbortController) {
    sweepAbortController.abort()
    sweepAbortController = null
  }
  activeWorkers = 0

  for (const task of queue) {
    if (task.status === "processing") {
      task.status = "pending"
    }
  }

  await saveQueue(pausedProjectPath)
  queue = []
  currentProjectId = ""
  currentProjectPath = ""
  processedSinceDrain = false
}

export async function restoreQueue(
  projectId: string,
  projectPath: string,
): Promise<void> {
  const pp = normalizePath(projectPath)
  queue = []
  activeWorkers = 0
  abortControllers.clear()
  currentProjectId = projectId
  currentProjectPath = pp

  const saved = await loadQueue(pp, projectId)
  const mine = saved.filter((t) => t.projectId === projectId)

  for (const task of mine) {
    if (task.status === "processing") {
      task.status = "pending"
    }
  }

  queue = mine
  await saveQueue(pp)

  if (queue.some((t) => t.status === "pending")) {
    processNext(projectId)
  }
}

// ── Processing ────────────────────────────────────────────────────────────

const MAX_RETRIES = 3

async function onQueueDrained(
  projectId: string,
  projectPath: string,
): Promise<void> {
  if (!processedSinceDrain || activeWorkers > 0 || currentProjectId !== projectId)
    return
  processedSinceDrain = false

  const pp = normalizePath(projectPath)

  // Trigger synthesis for bidding projects
  try {
    const schema = await readFile(`${pp}/schema.md`).catch(() => "")
    if (schema.includes("# Wiki Schema — Bidding Support")) {
      console.log(`[Ingest Queue] Triggering synthesis for bidding project...`)
      const { runSynthesis } = await import("@/lib/synthesis-engine")
      await runSynthesis(pp)
    }
  } catch (err) {
    console.error("[Ingest Queue] Failed to trigger synthesis:", err)
  }

  sweepAbortController = new AbortController()
  const signal = sweepAbortController.signal

  try {
    const { sweepResolvedReviews } = await import("@/lib/sweep-reviews")
    await sweepResolvedReviews(projectPath, signal)
  } catch (err) {
    console.error("[Ingest Queue] Failed to load sweep-reviews:", err)
  } finally {
    if (sweepAbortController && sweepAbortController.signal === signal) {
      sweepAbortController = null
    }
  }
}

async function processNext(projectId: string): Promise<void> {
  if (activeWorkers >= MAX_CONCURRENCY || !currentProjectId) return
  if (currentProjectId !== projectId) return

  const next = queue.find(
    (t) => t.projectId === projectId && t.status === "pending",
  )
  if (!next) {
    if (activeWorkers === 0) {
      onQueueDrained(projectId, currentProjectPath).catch((err) =>
        console.error("[Ingest Queue] sweep failed:", err),
      )
    }
    return
  }

  activeWorkers++
  next.status = "processing"

  // Try to start another worker immediately
  processNext(projectId)

  const registryPath = await getProjectPathById(projectId)
  const pp = registryPath ? normalizePath(registryPath) : ""

  if (!pp) {
    next.status = "failed"
    next.error = "Project not found in registry"
    activeWorkers--
    await saveQueue(currentProjectPath)
    processNext(projectId)
    return
  }

  await saveQueue(pp)
  if (currentProjectId !== projectId) {
    activeWorkers--
    return
  }

  const llmConfig = useWikiStore.getState().llmConfig
  if (!hasUsableLlm(llmConfig)) {
    next.status = "failed"
    next.error = "LLM not configured"
    activeWorkers--
    await saveQueue(pp)
    processNext(projectId)
    return
  }

  const fullSourcePath = isAbsolutePath(next.sourcePath)
    ? normalizePath(next.sourcePath)
    : `${pp}/${next.sourcePath}`

  const controller = new AbortController()
  abortControllers.set(next.id, controller)

  try {
    const writtenFiles = await autoIngest(
      pp,
      fullSourcePath,
      llmConfig,
      controller.signal,
      next.folderContext,
    )
    abortControllers.delete(next.id)

    if (currentProjectId !== projectId) {
      activeWorkers--
      return
    }

    if (writtenFiles.length === 0) {
      throw new Error("Ingest produced no output files")
    }

    queue = queue.filter((t) => t.id !== next.id)
    processedSinceDrain = true
    await saveQueue(pp)
  } catch (err) {
    abortControllers.delete(next.id)
    if (currentProjectId !== projectId) {
      activeWorkers--
      return
    }

    const message = err instanceof Error ? err.message : String(err)
    next.retryCount++
    next.error = message

    if (next.retryCount >= MAX_RETRIES) {
      next.status = "failed"
    } else {
      next.status = "pending"
    }
    await saveQueue(pp)
  }

  activeWorkers--
  processNext(projectId)
}
