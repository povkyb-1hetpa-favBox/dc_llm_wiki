import { describe, it, expect } from "vitest"
import {
  findAlignmentConflicts,
  generateClarificationWikiBlocks,
  type RequirementNode,
} from "./alignment-engine"

describe("Alignment Engine", () => {
  describe("Intra-discipline consistency", () => {
    it("detects different values for the same parameter in different documents within the same discipline", () => {
      const requirements: RequirementNode[] = [
        {
          slug: "req-001",
          discipline: "Electrical",
          parameter: "ups-capacity",
          value: "500kVA",
          document: "RFP-Main.pdf",
          title: "UPS Capacity Requirement",
          reqType: "demand",
        },
        {
          slug: "req-002",
          discipline: "Electrical",
          parameter: "ups-capacity",
          value: "400kVA",
          document: "Technical-Specs.docx",
          title: "Electrical Specification",
          reqType: "demand",
        },
      ]

      const conflicts = findAlignmentConflicts(requirements)
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].type).toBe("intra-discipline-consistency")
      expect(conflicts[0].relatedSlugs).toContain("req-001")
      expect(conflicts[0].relatedSlugs).toContain("req-002")
    })

    it("does not detect conflict if values are the same", () => {
      const requirements: RequirementNode[] = [
        {
          slug: "req-001",
          discipline: "Electrical",
          parameter: "ups-capacity",
          value: "500kVA",
          document: "RFP-Main.pdf",
          title: "UPS Capacity Requirement",
          reqType: "demand",
        },
        {
          slug: "req-002",
          discipline: "Electrical",
          parameter: "ups-capacity",
          value: "500kVA",
          document: "Technical-Specs.docx",
          title: "Electrical Specification",
          reqType: "demand",
        },
      ]

      const conflicts = findAlignmentConflicts(requirements)
      expect(conflicts).toHaveLength(0)
    })
  })

  describe("Inter-discipline interface closure", () => {
    it("detects when a demand is not met by a supply across disciplines", () => {
      const requirements: RequirementNode[] = [
        {
          slug: "req-mech-001",
          discipline: "Mechanical",
          parameter: "cooling-power-demand",
          value: "500kW",
          document: "Mechanical-Specs.pdf",
          title: "Cooling Power Demand",
          reqType: "demand",
        },
        {
          slug: "req-elec-001",
          discipline: "Electrical",
          parameter: "cooling-power-demand",
          value: "400kW", // Supply is less than demand
          document: "Electrical-Specs.pdf",
          title: "Power Supply for Cooling",
          reqType: "supply",
        },
      ]

      const conflicts = findAlignmentConflicts(requirements)
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].type).toBe("inter-discipline-interface")
      expect(conflicts[0].relatedSlugs).toContain("req-mech-001")
      expect(conflicts[0].relatedSlugs).toContain("req-elec-001")
    })

    it("does not detect conflict if supply meets demand", () => {
      const requirements: RequirementNode[] = [
        {
          slug: "req-mech-001",
          discipline: "Mechanical",
          parameter: "cooling-power-demand",
          value: "500kW",
          document: "Mechanical-Specs.pdf",
          title: "Cooling Power Demand",
          reqType: "demand",
        },
        {
          slug: "req-elec-001",
          discipline: "Electrical",
          parameter: "cooling-power-demand",
          value: "500kW",
          document: "Electrical-Specs.pdf",
          title: "Power Supply for Cooling",
          reqType: "supply",
        },
      ]

      const conflicts = findAlignmentConflicts(requirements)
      expect(conflicts).toHaveLength(0)
    })

    it("detects when supply is missing for a demand tagged as interface", () => {
      const requirements: RequirementNode[] = [
        {
          slug: "req-mech-001",
          discipline: "Mechanical",
          parameter: "cooling-power-demand",
          value: "500kW",
          document: "Mechanical-Specs.pdf",
          title: "Cooling Power Demand",
          reqType: "demand",
          isInterface: true,
        },
      ]

      const conflicts = findAlignmentConflicts(requirements)
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].type).toBe("inter-discipline-interface")
      expect(conflicts[0].description).toContain("Missing supply")
    })
  })

  describe("Wiki Block Generation", () => {
    it("generates valid FILE blocks for conflicts", () => {
      const conflicts = [
        {
          type: "intra-discipline-consistency" as const,
          severity: "high" as const,
          description: "Test conflict",
          relatedSlugs: ["req-1", "req-2"],
        },
      ]

      const blocks = generateClarificationWikiBlocks(conflicts)
      expect(blocks).toContain(
        "---FILE: wiki/clarifications/clar-001-intra-discipline-consistency.md---",
      )
      expect(blocks).toContain("type: clarification")
      expect(blocks).toContain("related: [req-1, req-2]")
      expect(blocks).toContain("---END FILE---")
    })
  })
})
