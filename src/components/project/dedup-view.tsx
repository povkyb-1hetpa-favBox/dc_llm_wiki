import { useState, useCallback } from "react"
import { useWikiStore } from "@/stores/wiki-store"
import { useTranslation } from "react-i18next"
import { 
  Library, 
  CopyCheck, 
  Sparkles, 
  AlertCircle, 
  ArrowRight,
  Loader2,
  Merge
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  extractEntitySummary, 
  detectDuplicateGroups, 
  mergeDuplicateGroup,
  type DuplicateGroup,
  type EntitySummary,
  type MergeResult
} from "@/lib/dedup"
import { listDirectory, readFile, writeFile, deleteFile } from "@/commands/fs"
import { normalizePath } from "@/lib/path-utils"
import { streamChat } from "@/lib/llm-client"
import { hasUsableLlm } from "@/lib/has-usable-llm"

export function DedupView() {
  useTranslation()
  const project = useWikiStore((s) => s.project)
  const llmConfig = useWikiStore((s) => s.llmConfig)
  const setFileTree = useWikiStore((s) => s.setFileTree)
  const bumpDataVersion = useWikiStore((s) => s.bumpDataVersion)

  const [scanning, setScanning] = useState(false)
  const [merging, setMerging] = useState<string | null>(null) // group ID being merged
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [status, setStatus] = useState<string>("")

  const runScan = useCallback(async () => {
    if (!project) return

    // 0. Validate LLM Config
    if (!hasUsableLlm(llmConfig)) {
      setStatus("LLM not configured. Please set your API key in Settings.")
      return
    }

    setScanning(true)
    setStatus("Scanning wiki for entities and concepts...")
    setGroups([])

    const pp = normalizePath(project.path)
    try {
      // 1. Collect all entities and concepts
      const mdFiles: { path: string; name: string }[] = []
      
      async function collect(dir: string) {
        const entries = await listDirectory(dir)
        for (const entry of entries) {
          if (entry.is_dir) await collect(entry.path)
          else if (entry.name.endsWith(".md")) mdFiles.push(entry)
        }
      }

      await collect(`${pp}/wiki/entities`)
      await collect(`${pp}/wiki/concepts`)

      const summaries: EntitySummary[] = []
      for (const file of mdFiles) {
        const content = await readFile(file.path)
        const summary = extractEntitySummary(file.path.replace(`${pp}/`, ""), content)
        if (summary) summaries.push(summary)
      }

      if (summaries.length < 2) {
        setStatus("Not enough entities to compare.")
        setScanning(false)
        return
      }

      setStatus(`Comparing ${summaries.length} entries via LLM...`)

      // 2. Detect duplicates
      const detected = await detectDuplicateGroups(
        summaries,
        async (sys, usr, sig) => {
          let full = ""
          return new Promise((resolve, reject) => {
            streamChat(llmConfig, [
              { role: "system", content: sys },
              { role: "user", content: usr }
            ], {
              onToken: (t) => { full += t },
              onDone: () => resolve(full),
              onError: (err) => reject(err)
            }, sig).catch(reject)
          })
        }
      )

      setGroups(detected)
      setStatus(detected.length > 0 
        ? `Found ${detected.length} potential duplicate groups.` 
        : "No duplicates found. Your wiki is clean!")
    } catch (err) {
      console.error("Dedup scan failed:", err)
      setStatus(`Scan failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setScanning(false)
    }
  }, [project, llmConfig])

  const handleMerge = async (group: DuplicateGroup) => {
    if (!project) return
    const groupId = group.slugs.join(",")
    setMerging(groupId)
    setStatus(`Merging ${group.slugs.length} pages...`)

    const pp = normalizePath(project.path)
    try {
      // 1. Load full content for the group
      const fullGroup: { slug: string; path: string; content: string }[] = []
      for (const slug of group.slugs) {
        // Try entities then concepts
        let path = `${pp}/wiki/entities/${slug}.md`
        let content = ""
        try {
          content = await readFile(path)
        } catch {
          path = `${pp}/wiki/concepts/${slug}.md`
          content = await readFile(path)
        }
        fullGroup.push({ slug, path, content })
      }

      // 2. Load ALL other wiki pages for reference rewriting
      const allWikiFiles: { path: string; content: string }[] = []
      async function collectAll(dir: string) {
        const entries = await listDirectory(dir)
        for (const entry of entries) {
          if (entry.is_dir) await collectAll(entry.path)
          else if (entry.name.endsWith(".md")) {
            const content = await readFile(entry.path)
            allWikiFiles.push({ path: entry.path, content })
          }
        }
      }
      await collectAll(`${pp}/wiki`)

      // 3. Compute merge
      const result: MergeResult = await mergeDuplicateGroup(
        {
          group: fullGroup,
          canonicalSlug: group.slugs[0], // Keep the first one as canonical
          otherWikiPages: allWikiFiles,
        },
        async (sys, usr, sig) => {
          let full = ""
          return new Promise((resolve, reject) => {
            streamChat(llmConfig, [
              { role: "system", content: sys },
              { role: "user", content: usr }
            ], {
              onToken: (t) => { full += t },
              onDone: () => resolve(full),
              onError: (err) => reject(err)
            }, sig).catch(reject)
          })
        }
      )

      // 4. Write changes
      // Canonical
      await writeFile(result.canonicalPath, result.canonicalContent)
      // Rewrites
      for (const r of result.rewrites) {
        await writeFile(r.path, r.newContent)
      }
      // Deletions
      for (const p of result.pagesToDelete) {
        await deleteFile(p)
      }

      // 5. Update UI
      setGroups(prev => prev.filter(g => g.slugs.join(",") !== groupId))
      setStatus(`Successfully merged into ${group.slugs[0]}`)
      
      // Refresh global state
      const tree = await listDirectory(pp)
      setFileTree(tree)
      bumpDataVersion()

    } catch (err) {
      console.error("Merge failed:", err)
      setStatus(`Merge failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setMerging(null)
    }
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center justify-between border-b px-8 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CopyCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">知识去重工具 (Wiki Deduplication)</h1>
            <p className="text-sm text-muted-foreground">通过 AI 识别并合并含义相同但名称不同的 Wiki 条目</p>
          </div>
        </div>
        <Button 
          onClick={runScan} 
          disabled={scanning}
          className="gap-2"
        >
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          立即扫描全库
        </Button>
      </div>

      <div className="flex-1 overflow-hidden p-8">
        {status && (
          <div className="mb-6 flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
            <AlertCircle className="h-4 w-4 text-primary" />
            <span>{status}</span>
          </div>
        )}

        <ScrollArea className="h-full pr-4">
          <div className="grid gap-6">
            {groups.map((group, idx) => {
              const groupId = group.slugs.join(",")
              const isMerging = merging === groupId

              return (
                <div key={idx} className="group relative overflow-hidden rounded-xl border bg-card p-6 shadow-sm transition-all hover:shadow-md">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        group.confidence === 'high' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' :
                        group.confidence === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' :
                        'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        {group.confidence} Confidence
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 mb-6">
                    {group.slugs.map((slug, sIdx) => (
                      <div key={slug} className="flex items-center gap-3">
                        <div className="rounded-md border bg-background px-3 py-2 text-sm font-medium shadow-sm">
                          {slug}
                        </div>
                        {sIdx < group.slugs.length - 1 && (
                          <div className="h-px w-4 bg-border" />
                        )}
                      </div>
                    ))}
                    <ArrowRight className="h-4 w-4 text-muted-foreground mx-2" />
                    <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-bold text-primary shadow-sm">
                      {group.slugs[0]} (合并后)
                    </div>
                  </div>

                  <div className="mb-6 rounded-lg bg-muted/20 p-4 text-sm leading-relaxed">
                    <p className="font-semibold text-foreground/80 mb-1">合并理由：</p>
                    {group.reason}
                  </div>

                  <div className="flex items-center gap-3">
                    <Button 
                      size="sm"
                      onClick={() => handleMerge(group)}
                      disabled={isMerging || !!merging}
                      className="gap-2"
                    >
                      {isMerging ? <Loader2 className="h-3 w-3 animate-spin" /> : <Merge className="h-3 w-3" />}
                      确认合并
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setGroups(prev => prev.filter(g => g.slugs.join(",") !== groupId))}
                      disabled={isMerging || !!merging}
                    >
                      忽略
                    </Button>
                  </div>
                </div>
              )
            })}

            {!scanning && groups.length === 0 && !status.includes("failed") && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="mb-4 rounded-full bg-muted p-4">
                  <Library className="h-10 w-10 text-muted-foreground/40" />
                </div>
                <h3 className="text-lg font-medium">准备好清理您的 Wiki 了吗？</h3>
                <p className="max-w-xs text-sm text-muted-foreground">点击上方的“立即扫描全库”按钮，让 AI 发现隐藏的重复项。</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
