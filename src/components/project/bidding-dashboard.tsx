import { useWikiStore } from "@/stores/wiki-store"
import { useTranslation } from "react-i18next"
import {
  FileText,
  AlertTriangle,
  HelpCircle,
  BookOpen,
  Search,
  ChevronRight,
  CheckCircle2,
  Clock,
  Loader2,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { useState, useEffect } from "react"
import { listDirectory } from "@/commands/fs"
import { normalizePath } from "@/lib/path-utils"
import { useActivityStore } from "@/stores/activity-store"

const REPORTS = [
  { id: "01", name: "01-客户信息", path: "wiki/synthesis/01-客户信息.md" },
  { id: "02", name: "02-项目概况", path: "wiki/synthesis/02-项目概况.md" },
  { id: "03", name: "03-资质要求", path: "wiki/synthesis/03-资质要求.md" },
  { id: "04", name: "04-交标材料", path: "wiki/synthesis/04-交标材料.md" },
  { id: "05", name: "05-项目范围", path: "wiki/synthesis/05-项目范围.md" },
  { id: "06", name: "06-澄清问题", path: "wiki/synthesis/06-澄清问题.md" },
  { id: "07", name: "07-风险清单", path: "wiki/synthesis/07-风险清单.md" },
]

export function BiddingDashboard() {
  useTranslation()
  const project = useWikiStore((s) => s.project)
  const setSelectedFile = useWikiStore((s) => s.setSelectedFile)
  const setActiveView = useWikiStore((s) => s.setActiveView)
  const activities = useActivityStore((s) => s.items)

  const [searchTerm, setSearchTerm] = useState("")
  const [existingReports, setExistingReports] = useState<Set<string>>(new Set())
  const [sourceCount, setSourceCount] = useState({ total: 0, done: 0 })

  // Scan for existing synthesis reports and source progress
  useEffect(() => {
    if (!project) return

    const scan = async () => {
      const pp = normalizePath(project.path)
      try {
        // 1. Check reports
        const synthesisFiles = await listDirectory(`${pp}/wiki/synthesis`)
        setExistingReports(new Set(synthesisFiles.map((f) => f.name)))

        // 2. Check source progress
        const sources = await listDirectory(`${pp}/raw/sources`)
        const summaries = await listDirectory(`${pp}/wiki/sources`)
        setSourceCount({
          total: sources.length,
          done: Math.min(summaries.length, sources.length),
        })
      } catch (err) {
        console.error("Dashboard scan failed:", err)
      }
    }

    scan()
    const interval = setInterval(scan, 5000) // Poll for updates
    return () => clearInterval(interval)
  }, [project, activities])

  const openReport = (path: string) => {
    setSelectedFile(`${project?.path}/${path}`)
    setActiveView("wiki")
  }

  const ingestProgress =
    sourceCount.total > 0
      ? Math.round((sourceCount.done / sourceCount.total) * 100)
      : 0

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto bg-background p-8 pb-16">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            投标指挥舱 (Bidding Command Center)
          </h1>
          <p className="text-muted-foreground">
            分布式专家 Agent 已就绪。项目界面与风险已自动聚合。
          </p>
        </div>
        <div className="flex items-center gap-4 rounded-lg border bg-muted/30 px-4 py-2">
          <div className="flex flex-col items-end">
            <span className="text-xs font-medium text-muted-foreground">
              标书阅读进度
            </span>
            <span className="text-sm font-bold">
              {sourceCount.done} / {sourceCount.total} 文件
            </span>
          </div>
          <div className="h-10 w-10 flex items-center justify-center rounded-full border-2 border-primary/20 relative">
            <svg className="h-full w-full -rotate-90">
              <circle
                cx="20"
                cy="20"
                r="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className="text-primary/10"
              />
              <circle
                cx="20"
                cy="20"
                r="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeDasharray={`${2 * Math.PI * 18}`}
                strokeDashoffset={`${2 * Math.PI * 18 * (1 - ingestProgress / 100)}`}
                className="text-primary transition-all duration-500"
              />
            </svg>
            <span className="absolute text-[10px] font-bold">
              {ingestProgress}%
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[
          {
            title: "项目风险",
            value: "高风险待评估",
            icon: AlertTriangle,
            color: "text-destructive",
          },
          {
            title: "待澄清问题",
            value: "自动提取中",
            icon: HelpCircle,
            color: "text-amber-500",
          },
          {
            title: "术语定义",
            value: "查看术语表",
            icon: BookOpen,
            color: "text-blue-500",
          },
          {
            title: "专家状态",
            value: "6个专业并行中",
            icon: FileText,
            color: "text-emerald-500",
          },
        ].map((stat, i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-xl border bg-card p-6 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </span>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </div>
            <div className="text-2xl font-bold">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">核心投标报告 (01-07)</h2>
            <span className="text-xs text-muted-foreground italic">
              自动根据 Wiki 实体生成
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {REPORTS.map((report) => {
              const isReady = existingReports.has(report.name + ".md")
              return (
                <button
                  key={report.id}
                  onClick={() => openReport(report.path)}
                  className={`group flex items-center justify-between rounded-lg border p-4 transition-all hover:shadow-md ${
                    isReady
                      ? "bg-card border-border hover:bg-accent"
                      : "bg-muted/20 border-dashed opacity-70"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <FileText
                        className={`h-5 w-5 ${isReady ? "text-primary" : "text-muted-foreground"}`}
                      />
                      {!isReady && (
                        <Clock className="absolute -bottom-1 -right-1 h-3 w-3 text-amber-500 animate-pulse bg-background rounded-full" />
                      )}
                    </div>
                    <div className="flex flex-col items-start">
                      <span className="font-medium">{report.name}</span>
                      <span className="text-[10px] text-muted-foreground uppercase">
                        {isReady ? "已生成" : "待提取"}
                      </span>
                    </div>
                  </div>
                  {isReady ? (
                    <ChevronRight className="h-4 w-4 opacity-0 transition-all group-hover:opacity-100" />
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col gap-6 rounded-xl border bg-card p-6 shadow-sm">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">任务进度</h2>
            <div className="space-y-4 pt-2">
              {[
                { label: "专业界面梳理", status: ingestProgress === 100 ? "done" : "ongoing" },
                { label: "自动风险审计", status: ingestProgress === 100 ? "done" : "ongoing" },
                { label: "01-07 板块汇总", status: existingReports.size === 7 ? "done" : "ongoing" },
              ].map((task, i) => (
                <div key={i} className="flex items-center gap-3">
                  {task.status === "done" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                  )}
                  <span className={`text-sm ${task.status === "done" ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {task.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <hr className="border-t" />
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">术语快查</h2>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索 PUE, UPS, BMS..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <button
            onClick={() => openReport("wiki/术语表.md")}
            className="w-full rounded-lg bg-secondary py-2 text-sm font-medium transition-colors hover:bg-secondary/80"
          >
            查看完整术语表
          </button>
        </div>
      </div>
    </div>
  )
}
