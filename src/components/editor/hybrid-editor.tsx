import { useMemo, useCallback } from "react"
import CodeMirror from "@uiw/react-codemirror"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import { languages } from "@codemirror/language-data"
import { vscodeDark, vscodeLight } from "@uiw/codemirror-theme-vscode"
import { EditorView } from "@codemirror/view"

interface HybridEditorProps {
  content: string
  onSave: (markdown: string) => void
}

export function HybridEditor({ content, onSave }: HybridEditorProps) {
  // Use current theme to pick editor style
  // Since we don't have a dedicated theme store yet, 
  // we check the body class which shadcn toggles.
  const isDark = document.documentElement.classList.contains("dark")

  const extensions = useMemo(() => [
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    EditorView.lineWrapping,
    EditorView.theme({
      "&": {
        height: "100%",
        fontSize: "14px",
      },
      ".cm-scroller": {
        fontFamily: "var(--font-sans), ui-sans-serif, system-ui",
      },
      ".cm-content": {
        padding: "20px 0",
      },
      // Heading styling
      ".cm-header-1": { fontSize: "1.8em", fontWeight: "bold", color: "var(--primary)" },
      ".cm-header-2": { fontSize: "1.4em", fontWeight: "bold", color: "var(--primary)" },
      ".cm-header-3": { fontSize: "1.2em", fontWeight: "bold" },
    }),
  ], [])

  const onChange = useCallback((value: string) => {
    onSave(value)
  }, [onSave])

  return (
    <div className="h-full w-full bg-background overflow-hidden">
      <CodeMirror
        value={content}
        height="100%"
        theme={isDark ? vscodeDark : vscodeLight}
        extensions={extensions}
        onChange={onChange}
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: true,
          dropCursor: true,
          allowMultipleSelections: true,
          indentOnInput: true,
        }}
        className="h-full border-none outline-none"
      />
    </div>
  )
}
