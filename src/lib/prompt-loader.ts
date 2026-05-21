import { readFile, writeFile, createDirectory } from "@/commands/fs"
import defaultSpecialistPrompt from "./templates/default-specialist-agent.md?raw"
import defaultAnalysisPrompt from "./templates/default-analysis-prompt.md?raw"
import defaultGenerationPrompt from "./templates/default-generation-prompt.md?raw"
import { DISCIPLINE_NAMES, type Discipline } from "./templates"

export type PromptType = "specialist-agent" | "analysis-stage-1" | "generation-stage-2"

const DEFAULTS: Record<PromptType, string> = {
  "specialist-agent": defaultSpecialistPrompt,
  "analysis-stage-1": defaultAnalysisPrompt,
  "generation-stage-2": defaultGenerationPrompt,
}

/**
 * Initializes a project with default prompt files.
 */
export async function initializeProjectPrompts(projectPath: string): Promise<void> {
  const promptDir = `${projectPath}/wiki/config/prompts`
  try {
    await createDirectory(promptDir)
    for (const [type, content] of Object.entries(DEFAULTS)) {
      const filePath = `${promptDir}/${type}.md`
      await writeFile(filePath, content)
    }
  } catch (err) {
    console.error("Failed to initialize project prompts:", err)
  }
}

/**
 * Loads a prompt for the given project.
 * Priority: 
 * 1. Project-local file at wiki/config/prompts/{type}.md
 * 2. Built-in default
 */
export async function loadProjectPrompt(
  projectPath: string,
  type: PromptType,
): Promise<string> {
  const localPath = `${projectPath}/wiki/config/prompts/${type}.md`

  try {
    const content = await readFile(localPath)
    if (content && content.trim()) {
      return content
    }
  } catch {
    // Local file missing or unreadable, fall back to default
  }
  return DEFAULTS[type]
}

/**
 * Replaces placeholders in a prompt string.
 */
export function resolvePromptPlaceholders(
  prompt: string,
  context: {
    discipline?: Discipline
    allDisciplines?: string[]
  },
): string {
  let resolved = prompt

  if (context.discipline) {
    resolved = resolved.replace(/\${disciplineName}/g, DISCIPLINE_NAMES[context.discipline])
  }

  if (context.allDisciplines) {
    resolved = resolved.replace(/\${allDisciplines}/g, context.allDisciplines.join(", "))
  }

  return resolved
}
