# Wiki Schema — Bidding Support

## Page Types

| Type | Directory | Purpose |
|------|-----------|---------|
| requirement | wiki/requirements/ | Specific requirements extracted from RFP/RFI documents |
| glossary | wiki/glossary/ | Technical terms, acronyms, and project-specific definitions |
| clarification | wiki/clarifications/ | Questions sent to or received from the client |
| risk | wiki/risks/ | Potential project risks and their mitigation plans |
| entity | wiki/entities/ | Named things (competitors, partners, products) |
| concept | wiki/concepts/ | Technical concepts or bidding frameworks |
| source | wiki/sources/ | Original bidding documents, technical whitepapers, etc. |
| overview | wiki/ | High-level project summary (one per project) |

## Naming Conventions

- Files: `kebab-case.md`
- Requirements: `req-NNN-slug.md` (e.g., `req-001-power-density.md`)
- Glossary: `term.md` (e.g., `pue.md`, `ups.md`)
- Clarifications: `clar-NNN-slug.md` (e.g., `clar-005-cooling-redundancy.md`)
- Risks: `risk-NNN-slug.md` (e.g., `risk-001-lead-time.md`)
- Sources: `author-year-slug.md` or `doc-type-slug.md`

## Frontmatter

All pages must include YAML frontmatter:

```yaml
---
type: requirement | glossary | clarification | risk | entity | concept | source | overview
title: Human-readable title
tags: []
related: []
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

Requirement pages also include:
```yaml
priority: high | medium | low
status: pending | met | partially-met | unmet | clarified
owner: ""
```

Clarification pages also include:
```yaml
status: draft | sent | received | resolved
date_sent: YYYY-MM-DD
date_received: YYYY-MM-DD
```

Risk pages also include:
```yaml
impact: high | medium | low
probability: high | medium | low
mitigation_status: open | in-progress | closed
```

## Index Format

`wiki/index.md` lists all pages grouped by type. Each entry:
```
- [[page-slug]] — one-line description
```

## Log Format

`wiki/log.md` records activity in reverse chronological order:
```
## YYYY-MM-DD

- Action taken / finding noted
```

## Cross-referencing Rules

- Requirements link to the sources they were extracted from
- Clarifications link to the specific requirements they address
- Risks link to related requirements or technical concepts
- Use `[[page-slug]]` syntax to link between wiki pages

## Contradiction Handling

When sources or requirements contradict each other:
1. Note the contradiction in the relevant requirement or risk page
2. Create a clarification item to resolve the ambiguity with the client
3. Track the resolution in the log and update the affected pages

## Bidding-Specific Conventions

- Requirements should be as atomic as possible
- Glossary terms should match the client's terminology where it differs from standard
- Every high impact risk must have a linked mitigation plan
- Maintain a strict log of all changes during the "hot" bidding phase
