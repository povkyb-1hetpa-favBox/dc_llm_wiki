import { useMemo, useState } from "react"
import { Pencil, Eye } from "lucide-react"
import { parseFrontmatter } from "@/lib/frontmatter"
import { FrontmatterPanel } from "@/components/editor/frontmatter-panel"
import { WikiReader } from "@/components/editor/wiki-reader"
import { HybridEditor } from "@/components/editor/hybrid-editor"

interface WikiEditorProps {
  content: string
  onSave: (markdown: string) => void
}

function wrapBareMathBlocks(text: string): string {
  return text.replace(
    /(?<!\$\$\s*)(\\begin\{[^}]+\}[\s\S]*?\\end\{[^}]+\})(?!\s*\$$)/g,
    (_match, block: string) => `$$\n${block}\n$$`,
  )
}

export function WikiEditor({ content, onSave }: WikiEditorProps) {
  const [mode, setMode] = useState<"read" | "edit">("read")

  // Split frontmatter from body. Both modes consume `body`;
  // HybridEditor additionally rebuilds the full file via `rawBlock`
  // on save so user-managed YAML survives untouched.
  const { frontmatter, body, rawBlock } = useMemo(
    () => parseFrontmatter(content),
    [content],
  )

  const processedBody = useMemo(() => wrapBareMathBlocks(body), [body])

  const handleSave = useMemo(
    () => (markdown: string) => onSave(rawBlock + markdown),
    [onSave, rawBlock],
  )

  return (
    <div className="relative h-full overflow-auto">
      <button
        type="button"
        onClick={() => setMode((m) => (m === "read" ? "edit" : "read"))}
        title={mode === "read" ? "Edit (raw markdown)" : "Done editing"}
        className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground"
      >
        {mode === "read" ? (
          <Pencil className="h-3.5 w-3.5" />
        ) : (
          <Eye className="h-3.5 w-3.5" />
        )}
        {mode === "read" ? "Edit" : "Done"}
      </button>

      {mode === "read" ? (
        <div className="px-6 py-6">
          {frontmatter && <FrontmatterPanel data={frontmatter} />}
          <WikiReader body={body} />
        </div>
      ) : (
        <div className="flex h-full flex-col px-6 py-6">
          {frontmatter && <FrontmatterPanel data={frontmatter} />}
          <div className="flex-1 overflow-hidden rounded-md border border-border/50 bg-muted/5 shadow-inner">
            <HybridEditor content={processedBody} onSave={handleSave} />
          </div>
        </div>
      )}
    </div>
  )
}
