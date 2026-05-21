export interface WikiProject {
  /** Stable UUID, persisted inside the project at .llm-wiki/project.json.
   *  Survives the user moving or renaming the project folder. */
  id: string
  name: string
  path: string
}

export interface WikiTemplate {
  id: string
  name: string
  description: string
  icon: string
  schema: string
  purpose: string
  extraDirs: string[]
}

export interface FileNode {
  name: string
  path: string
  is_dir: boolean
  mtime?: number
  children?: FileNode[]
}

export interface WikiPage {
  path: string
  content: string
  frontmatter: Record<string, unknown>
}
