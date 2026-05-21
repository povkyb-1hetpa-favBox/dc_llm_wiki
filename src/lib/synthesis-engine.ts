import { readFile, writeFile, listDirectory } from "@/commands/fs"
import { parseFrontmatter } from "@/lib/frontmatter"
import { normalizePath } from "@/lib/path-utils"
import { loadReviewItems } from "@/lib/persist"
import type { WikiPage } from "@/types/wiki"
import type { ReviewItem } from "@/stores/review-store"
import { DISCIPLINE_NAMES, type Discipline } from "@/lib/templates"

export interface SynthesisResult {
  reports: Record<string, string>
  glossary: string
}

interface SynthesisCacheEntry {
  mtime: number
  page: WikiPage
}

interface SynthesisCache {
  version: number
  files: Record<string, SynthesisCacheEntry>
}

const CACHE_VERSION = 1

/**
 * Scans the wiki directory and aggregates all pages into a synthesis report.
 * Uses incremental synthesis by caching parsed frontmatter and body.
 */
export async function runSynthesis(
  projectPath: string,
): Promise<SynthesisResult> {
  const pp = normalizePath(projectPath)
  const wikiDir = `${pp}/wiki`

  // 1. Load cache
  const cache = await loadSynthesisCache(pp)

  // 2. Scan all wiki pages (incrementally)
  const pages = await scanWikiPagesIncremental(wikiDir, cache)

  // 3. Save cache
  await saveSynthesisCache(pp, cache)

  // 4. Load review items (contradictions)
  const reviewItems = await loadReviewItems(pp)
  const contradictions = reviewItems.filter(
    (item) => item.type === "contradiction",
  )

  // 5. Aggregate data
  const data = aggregateData(pages, contradictions)

  // 6. Generate reports
  const reports = generateReports(data)

  // 7. Generate glossary
  const glossary = generateGlossary(data.glossary)

  // 8. Write reports to disk
  await writeSynthesisReports(pp, reports, glossary)

  return { reports, glossary }
}

async function loadSynthesisCache(projectPath: string): Promise<SynthesisCache> {
  const cachePath = `${projectPath}/.llm-wiki/synthesis-cache.json`
  try {
    const raw = await readFile(cachePath)
    const data = JSON.parse(raw) as SynthesisCache
    if (data.version === CACHE_VERSION) {
      return data
    }
  } catch {
    // ignore
  }
  return { version: CACHE_VERSION, files: {} }
}

async function saveSynthesisCache(
  projectPath: string,
  cache: SynthesisCache,
): Promise<void> {
  const cachePath = `${projectPath}/.llm-wiki/synthesis-cache.json`
  try {
    await writeFile(cachePath, JSON.stringify(cache, null, 2))
  } catch (err) {
    console.error("Failed to save synthesis cache:", err)
  }
}

async function scanWikiPagesIncremental(
  wikiDir: string,
  cache: SynthesisCache,
): Promise<WikiPage[]> {
  const wikiDirNormalized = wikiDir.replace(/\\/g, "/")
  const currentFiles = new Set<string>()

  async function walk(dir: string) {
    const entries = await listDirectory(dir)
    for (const entry of entries) {
      const fullPath = entry.path.replace(/\\/g, "/")
      if (entry.is_dir) {
        await walk(fullPath)
      } else if (fullPath.endsWith(".md")) {
        const fileName = fullPath.split("/").pop()
        if (
          ["index.md", "log.md", "overview.md", "purpose.md", "schema.md"].includes(
            fileName || "",
          )
        ) {
          continue
        }

        const relativePath = fullPath.startsWith(wikiDirNormalized)
          ? fullPath.slice(wikiDirNormalized.length + 1)
          : fullPath

        currentFiles.add(relativePath)

        const mtime = entry.mtime ?? 0
        const cached = cache.files[relativePath]

        if (cached && cached.mtime === mtime) {
          // Cache hit
          continue
        }

        // Cache miss: read and parse
        try {
          const content = await readFile(fullPath)
          const { frontmatter, body } = parseFrontmatter(content)
          if (frontmatter) {
            cache.files[relativePath] = {
              mtime,
              page: {
                path: relativePath,
                content: body,
                frontmatter: frontmatter as Record<string, any>,
              },
            }
          }
        } catch (err) {
          console.error(`Failed to read/parse wiki page: ${fullPath}`, err)
        }
      }
    }
  }

  await walk(wikiDir)

  // Remove deleted files from cache
  for (const path in cache.files) {
    if (!currentFiles.has(path)) {
      delete cache.files[path]
    }
  }

  return Object.values(cache.files).map((entry) => entry.page)
}

interface AggregatedData {
  entities: WikiPage[]
  requirements: WikiPage[]
  risks: WikiPage[]
  glossary: WikiPage[]
  clarifications: WikiPage[]
  contradictions: ReviewItem[]
  overview: string
}

function aggregateData(
  pages: WikiPage[],
  contradictions: ReviewItem[],
): AggregatedData {
  const data: AggregatedData = {
    entities: [],
    requirements: [],
    risks: [],
    glossary: [],
    clarifications: [],
    contradictions,
    overview: "",
  }

  for (const page of pages) {
    const type = page.frontmatter.type
    switch (type) {
      case "entity":
        data.entities.push(page)
        break
      case "requirement":
        data.requirements.push(page)
        break
      case "risk":
        data.risks.push(page)
        break
      case "glossary":
        data.glossary.push(page)
        break
      case "clarification":
        data.clarifications.push(page)
        break
    }
  }

  return data
}

function generateReports(data: AggregatedData): Record<string, string> {
  const reports: Record<string, string> = {}

  // 01-客户信息.md
  reports["01-客户信息.md"] = generateClientInfoReport(data.entities)

  // 02-项目概况.md
  reports["02-项目概况.md"] = generateProjectOverviewReport(data)

  // 03-资质要求.md
  reports["03-资质要求.md"] = generateQualificationReport(data.requirements)

  // 04-交标材料.md
  reports["04-交标材料.md"] = generateSubmissionMaterialsReport(
    data.requirements,
  )

  // 05-项目范围.md
  reports["05-项目范围.md"] = generateProjectScopeReport(data.requirements)

  // 06-澄清问题.md
  reports["06-澄清问题.md"] = generateClarificationsReport(
    data.clarifications,
    data.contradictions,
  )

  // 07-风险清单.md
  reports["07-风险清单.md"] = generateRisksReport(data.risks)

  return reports
}

function generateClientInfoReport(entities: WikiPage[]): string {
  const clients = entities.filter((e) => {
    const tags = (e.frontmatter.tags as string[]) || []
    return tags.some((t) => /client|customer|业主|客户/i.test(t))
  })

  let md = "# 01-客户信息\n\n"
  if (clients.length === 0) {
    md += "暂无客户相关信息。\n"
  } else {
    for (const client of clients) {
      md += `## ${client.frontmatter.title}\n\n`
      md += `${client.content}\n\n`
    }
  }
  return md
}

function generateProjectOverviewReport(data: AggregatedData): string {
  let md = "# 02-项目概况\n\n"
  // This could be pulled from wiki/overview.md if we read it
  md += "详见 Wiki Overview 及各 Source 汇总。\n\n"

  if (data.entities.length > 0) {
    md += "### 关键相关方\n"
    for (const entity of data.entities) {
      md += `- [[${getSlug(entity.path)}|${entity.frontmatter.title}]]\n`
    }
  }

  return md
}

function generateQualificationReport(requirements: WikiPage[]): string {
  const quals = requirements.filter((r) => {
    const tags = (r.frontmatter.tags as string[]) || []
    return tags.some((t) => /qualification|资质|准入|cert/i.test(t))
  })

  let md = "# 03-资质要求\n\n"
  if (quals.length === 0) {
    md += "暂无资质相关要求。\n"
  } else {
    for (const req of quals) {
      md += `### ${req.frontmatter.title}\n`
      md += `- **优先级**: ${req.frontmatter.priority || "未指定"}\n`
      md += `- **状态**: ${req.frontmatter.status || "未指定"}\n\n`
      md += `${req.content}\n\n`
    }
  }
  return md
}

function generateSubmissionMaterialsReport(requirements: WikiPage[]): string {
  const materials = requirements.filter((r) => {
    const tags = (r.frontmatter.tags as string[]) || []
    return tags.some(
      (t) => /submission|material|交标|材料|文件|document/i.test(t),
    )
  })

  let md = "# 04-交标材料\n\n"
  if (materials.length === 0) {
    md += "暂无交标材料相关要求。\n"
  } else {
    for (const req of materials) {
      md += `### ${req.frontmatter.title}\n`
      md += `- **优先级**: ${req.frontmatter.priority || "未指定"}\n\n`
      md += `${req.content}\n\n`
    }
  }
  return md
}

function generateProjectScopeReport(requirements: WikiPage[]): string {
  let md = "# 05-项目范围\n\n"

  const disciplines: Discipline[] = ["EL", "ME", "FS", "P&D", "ELV", "BW"]

  for (const disc of disciplines) {
    const discName = DISCIPLINE_NAMES[disc]
    const discReqs = requirements.filter((r) => {
      const tags = (r.frontmatter.tags as string[]) || []
      return tags.includes(disc) || tags.includes(discName)
    })

    md += `## ${discName} (${disc})\n\n`
    if (discReqs.length === 0) {
      md += "该专业暂无明确范围要求。\n\n"
    } else {
      for (const req of discReqs) {
        md += `### ${req.frontmatter.title}\n`
        md += `${req.content}\n\n`
      }
    }
  }

  return md
}

function generateClarificationsReport(
  clarifications: WikiPage[],
  contradictions: ReviewItem[],
): string {
  let md = "# 06-澄清问题\n\n"

  md += "## 待澄清事项 (Clarifications)\n\n"
  if (clarifications.length === 0) {
    md += "暂无待澄清事项。\n\n"
  } else {
    for (const clar of clarifications) {
      md += `### ${clar.frontmatter.title}\n`
      md += `- **状态**: ${clar.frontmatter.status || "未指定"}\n\n`
      md += `${clar.content}\n\n`
    }
  }

  md += "## 数据冲突 (Contradictions)\n\n"
  if (contradictions.length === 0) {
    md += "暂无检测到的数据冲突。\n\n"
  } else {
    for (const contra of contradictions) {
      md += `### ${contra.title}\n`
      md += `${contra.description}\n\n`
      if (contra.affectedPages && contra.affectedPages.length > 0) {
        md += `**涉及页面**: ${contra.affectedPages.join(", ")}\n\n`
      }
    }
  }

  return md
}

function generateRisksReport(risks: WikiPage[]): string {
  let md = "# 07-风险清单\n\n"

  if (risks.length === 0) {
    md += "暂无风险项。\n"
  } else {
    // Sort by impact if available
    const sortedRisks = [...risks].sort((a, b) => {
      const impactA = String(a.frontmatter.impact || "").toLowerCase()
      const impactB = String(b.frontmatter.impact || "").toLowerCase()
      const score = { high: 3, medium: 2, low: 1 } as any
      return (score[impactB] || 0) - (score[impactA] || 0)
    })

    for (const risk of sortedRisks) {
      md += `### ${risk.frontmatter.title}\n`
      md += `- **影响**: ${risk.frontmatter.impact || "未指定"}\n`
      md += `- **概率**: ${risk.frontmatter.probability || "未指定"}\n`
      md += `- **应对状态**: ${risk.frontmatter.mitigation_status || "未指定"}\n\n`
      md += `${risk.content}\n\n`
    }
  }

  return md
}

function generateGlossary(glossaryPages: WikiPage[]): string {
  let md = "# 术语表\n\n"

  if (glossaryPages.length === 0) {
    md += "暂无术语定义。\n"
  } else {
    const sorted = [...glossaryPages].sort((a, b) =>
      String(a.frontmatter.title).localeCompare(String(b.frontmatter.title)),
    )

    for (const term of sorted) {
      md += `### ${term.frontmatter.title}\n`
      md += `${term.content}\n\n`
    }
  }

  return md
}

async function writeSynthesisReports(
  projectPath: string,
  reports: Record<string, string>,
  glossary: string,
): Promise<void> {
  const synthesisDir = `${projectPath}/wiki/synthesis`

  for (const [fileName, content] of Object.entries(reports)) {
    await writeFile(`${synthesisDir}/${fileName}`, content)
  }

  await writeFile(`${projectPath}/wiki/术语表.md`, glossary)
}

function getSlug(relativePath: string): string {
  return relativePath.replace(".md", "")
}
