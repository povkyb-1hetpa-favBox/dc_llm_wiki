import { useWikiStore } from "@/stores/wiki-store"
import { useTranslation } from "react-i18next"
import {
  FileText,
  AlertTriangle,
  HelpCircle,
  BookOpen,
  Search,
  ChevronRight,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { useState } from "react"

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

  const [searchTerm, setSearchTerm] = useState("")

  const openReport = (path: string) => {
    setSelectedFile(`${project?.path}/${path}`)
    setActiveView("wiki")
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto bg-background p-8">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            投标指挥舱 (Bidding Command Center)
          </h1>
          <p className="text-muted-foreground">
            分布式专家 Agent 已就绪。项目界面与风险已自动聚合。
          </p>
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
          <h2 className="text-xl font-semibold">核心投标报告 (01-07)</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {REPORTS.map((report) => (
              <button
                key={report.id}
                onClick={() => openReport(report.path)}
                className="group flex items-center justify-between rounded-lg border p-4 transition-all hover:bg-accent hover:shadow-md"
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-primary" />
                  <span className="font-medium">{report.name}</span>
                </div>
                <ChevronRight className="h-4 w-4 opacity-0 transition-all group-hover:opacity-100" />
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-6 rounded-xl border bg-card p-6 shadow-sm">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">术语快查</h2>
            <p className="text-sm text-muted-foreground">
              输入专业缩写快速定位定义。
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索 PUE, UPS, BMS..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex-1 rounded-lg bg-muted/30 p-4">
            <p className="text-xs italic text-muted-foreground">
              系统已从当前标书中提取 42 个行业术语。
            </p>
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
