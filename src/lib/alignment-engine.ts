export interface RequirementNode {
  slug: string
  title: string
  discipline: string
  parameter: string
  value: string | number
  document: string
  reqType: 'supply' | 'demand'
  isInterface?: boolean
}

export interface AlignmentConflict {
  type: 'intra-discipline-consistency' | 'inter-discipline-interface'
  description: string
  relatedSlugs: string[]
  severity: 'high' | 'medium' | 'low'
}

function parseValue(val: string | number): { num: number; unit: string } | string {
  if (typeof val === 'number') return { num: val, unit: '' }
  const match = val.match(/^([\d.]+)\s*([a-zA-Z%]+)$/)
  if (match) {
    return { num: parseFloat(match[1]), unit: match[2] }
  }
  return val.trim()
}

function areValuesEqual(v1: string | number, v2: string | number): boolean {
  const p1 = parseValue(v1)
  const p2 = parseValue(v2)

  if (typeof p1 === 'object' && typeof p2 === 'object') {
    return p1.num === p2.num && p1.unit.toLowerCase() === p2.unit.toLowerCase()
  }
  return String(v1).trim() === String(v2).trim()
}

function isSupplyMeetingDemand(supply: string | number, demand: string | number): boolean {
  const s = parseValue(supply)
  const d = parseValue(demand)

  if (typeof s === 'object' && typeof d === 'object') {
    if (s.unit.toLowerCase() !== d.unit.toLowerCase()) return false
    return s.num >= d.num
  }
  return String(supply).trim() === String(demand).trim()
}

export function findAlignmentConflicts(requirements: RequirementNode[]): AlignmentConflict[] {
  const conflicts: AlignmentConflict[] = []

  // 1. Intra-discipline consistency check
  // Group by discipline + parameter
  const intraGroups: Record<string, RequirementNode[]> = {}
  for (const req of requirements) {
    const key = `${req.discipline}|${req.parameter}`
    if (!intraGroups[key]) intraGroups[key] = []
    intraGroups[key].push(req)
  }

  for (const group of Object.values(intraGroups)) {
    if (group.length < 2) continue
    const first = group[0]
    for (let i = 1; i < group.length; i++) {
      if (!areValuesEqual(first.value, group[i].value)) {
        conflicts.push({
          type: 'intra-discipline-consistency',
          severity: 'high',
          description: `Consistency conflict in ${first.discipline} for ${first.parameter}: "${first.value}" (${first.document}) vs "${group[i].value}" (${group[i].document})`,
          relatedSlugs: group.map(r => r.slug)
        })
        break
      }
    }
  }

  // 2. Inter-discipline interface closure check
  // Group by parameter
  const interGroups: Record<string, { supply: RequirementNode[], demand: RequirementNode[] }> = {}
  for (const req of requirements) {
    if (!interGroups[req.parameter]) interGroups[req.parameter] = { supply: [], demand: [] }
    if (req.reqType === 'supply') {
      interGroups[req.parameter].supply.push(req)
    } else {
      interGroups[req.parameter].demand.push(req)
    }
  }

  for (const [parameter, group] of Object.entries(interGroups)) {
    const isTaggedInterface = group.supply.some(r => r.isInterface) || group.demand.some(r => r.isInterface)
    const disciplines = new Set([...group.supply, ...group.demand].map(r => r.discipline))
    
    // Check if it's an interface (either tagged or involves multiple disciplines)
    if (disciplines.size < 2 && !isTaggedInterface) continue

    if (group.demand.length > 0 && group.supply.length === 0) {
      conflicts.push({
        type: 'inter-discipline-interface',
        severity: 'high',
        description: `Missing supply for interface parameter: ${parameter}. Demanded by: ${group.demand.map(d => `${d.discipline} (${d.value})`).join(', ')}`,
        relatedSlugs: group.demand.map(d => d.slug)
      })
      continue
    }

    for (const d of group.demand) {
      for (const s of group.supply) {
        if (!isSupplyMeetingDemand(s.value, d.value)) {
          conflicts.push({
            type: 'inter-discipline-interface',
            severity: 'high',
            description: `Interface mismatch for ${parameter}: ${d.discipline} demands ${d.value}, but ${s.discipline} only supplies ${s.value}`,
            relatedSlugs: [d.slug, s.slug]
          })
        }
      }
    }
  }

  return conflicts
}

export function generateClarificationWikiBlocks(
  conflicts: AlignmentConflict[],
): string {
  return conflicts
    .map((conflict, index) => {
      const date = new Date().toISOString().slice(0, 10)
      const slug = `clar-${String(index + 1).padStart(3, "0")}-${conflict.type}`
      const title = `Clarification: ${
        conflict.type === "intra-discipline-consistency"
          ? "Consistency conflict"
          : "Interface mismatch"
      }`

      return [
        `---FILE: wiki/clarifications/${slug}.md---`,
        "---",
        "type: clarification",
        `title: "${title}"`,
        `created: ${date}`,
        `updated: ${date}`,
        `tags: [alignment, conflict, ${conflict.severity}]`,
        `related: [${conflict.relatedSlugs.join(", ")}]`,
        "status: draft",
        "---",
        "",
        `# ${title}`,
        "",
        `**Description:** ${conflict.description}`,
        "",
        "**Severity:** " + conflict.severity.toUpperCase(),
        "",
        "**Suggested Action:** Investigate the source documents and clarify with the client.",
        "---END FILE---",
      ].join("\n")
    })
    .join("\n\n")
}
