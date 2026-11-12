import { describe, expect, it } from "vitest";
import {
  cleanAndStandardizeExtraction,
  mergeIntervalsAndCountMonths,
  parseFuzzyMonthYear,
} from "./cleaner";
import type { ParsedDocumentResult, RawLLMExtraction } from "./schemas";

describe("Date math & overlapping interval merging", () => {
  it("merges overlapping roles so concurrent internships do not double-count months", () => {
    const jan2022 = parseFuzzyMonthYear("Jan 2022")!;
    const dec2023 = parseFuzzyMonthYear("Dec 2023", undefined, true)!;
    const jun2022 = parseFuzzyMonthYear("Jun 2022")!;
    const jun2023 = parseFuzzyMonthYear("Jun 2023", undefined, true)!;

    // 24 months full-time + overlapping 13-month side project -> still 24 months total
    const months = mergeIntervalsAndCountMonths([
      { start: jan2022, end: dec2023 },
      { start: jun2022, end: jun2023 },
    ]);
    expect(months).toBe(24);
  });

  it("parses Present/Current relative to reference date", () => {
    const ref = new Date("2026-11-12T00:00:00Z");
    const present = parseFuzzyMonthYear("Present", ref, true);
    expect(present).toBe(2026 * 12 + 10); // Nov is 0-indexed month 10
  });
});

describe("Post-LLM deterministic cleaner & hallucination guard", () => {
  it("strips hallucinated skills, normalizes aliases, recovers missed taxonomy terms, and flags math discrepancies", () => {
    const parsed: ParsedDocumentResult = {
      fileType: "docx",
      status: "success",
      parserUsed: "mammoth+ooxml",
      normalizedText:
        "Experienced sustainability analyst skilled in GaBi ts, ISO14040, and ISO 14044. Worked on LCI data collection and Figma wireframes.",
      rawHtmlPreview: null,
      charCount: 132,
      wordCount: 20,
      pageOrParagraphCount: 1,
      hadTablesOrTextBoxes: false,
      extractedHyperlinks: ["https://www.figma.com/design/abc123"],
      diagnostics: [],
    };

    const rawLlm: RawLLMExtraction = {
      candidateLabel: "test",
      professionalSummary: "  <p>Analyst summary</p>  ",
      totalExperienceYearsReported: 6.0, // exaggerated compared to 24 months
      lcaExperienceYearsReported: 5.0,
      uiuxExperienceYearsReported: null,
      skills: [
        {
          rawName: "gabi ts",
          domainHint: "lca_sustainability",
          evidenceSnippet: "skilled in GaBi ts",
        },
        {
          rawName: "SimaPro", // Hallucinated! Not in source text!
          domainHint: "lca_sustainability",
          evidenceSnippet: "expert in SimaPro modeling",
        },
        {
          rawName: "figjam",
          domainHint: "uiux_design",
          evidenceSnippet: "Figma wireframes",
        },
      ],
      experiences: [
        {
          title: "LCA Analyst",
          organization: "EcoConsult",
          startDateRaw: "Jan 2022",
          endDateRaw: "Dec 2023",
          durationMonthsReported: 24,
          domain: "other", // deliberately misclassified by LLM; cleaner should correct to lca_sustainability
          responsibilities: ["Built LCI datasets following ISO 14040"],
          toolsUsed: ["GaBi"],
          evidenceSnippet: "Built LCI datasets",
        },
      ],
      projects: [],
      education: [
        {
          degreeRaw: "M.Sc",
          fieldOfStudy: "Environmental Science",
          institution: "IIT Madras",
          graduationYear: "2021",
          isEnvironmentalDomain: true,
          isDesignDomain: false,
        },
      ],
      certificationsAndStandards: ["iso14040"],
      portfolioOrProfileUrls: [],
      roleKeywords: ["LCI"],
      uncertaintyFlags: [],
    };

    const cleaned = cleanAndStandardizeExtraction(rawLlm, parsed);
    const skillNames = cleaned.skills.map((s) => s.canonicalName);

    // Standardized GaBi & recovered ISO 14040 / ISO 14044 / Figma
    expect(skillNames).toContain("GaBi");
    expect(skillNames).toContain("ISO 14040");
    expect(skillNames).toContain("ISO 14044");
    expect(skillNames).toContain("Figma");

    // Hallucinated SimaPro must be stripped!
    expect(skillNames).not.toContain("SimaPro");
    expect(
      cleaned.cleaningAuditLog.some((log) => log.includes("SimaPro"))
    ).toBe(true);

    // Experience math discrepancy flagged (5.0 reported vs 2.0 merged)
    expect(cleaned.experience.lcaYears).toBe(2.0);
    expect(cleaned.experience.llmDiscrepancyFlag).toBe(true);
    expect(cleaned.summary).toBe("Analyst summary");
    expect(cleaned.education[0]?.normalizedLevel).toBe("masters");
  });

  it("never overwrites OpenLCA/ecoinvent LCA projects or roles to UI/UX when generic prototype/redesign words appear", () => {
    const parsed: ParsedDocumentResult = {
      fileType: "docx",
      status: "success",
      parserUsed: "mammoth+ooxml",
      normalizedText:
        "Built a product prototype carbon model in OpenLCA using ecoinvent datasets and redesigned process flows.",
      rawHtmlPreview: null,
      charCount: 105,
      wordCount: 16,
      pageOrParagraphCount: 1,
      hadTablesOrTextBoxes: false,
      extractedHyperlinks: [],
      diagnostics: [],
    };

    const rawLlm: RawLLMExtraction = {
      candidateLabel: "openlca-test",
      professionalSummary: null,
      totalExperienceYearsReported: null,
      lcaExperienceYearsReported: null,
      uiuxExperienceYearsReported: null,
      skills: [],
      experiences: [
        {
          title: "Sustainability Researcher",
          organization: "GreenLab",
          startDateRaw: "Jan 2024",
          endDateRaw: "Jan 2025",
          durationMonthsReported: 12,
          domain: "uiux_design",
          responsibilities: [
            "Modeled prototype battery recycling workflows in OpenLCA with ecoinvent",
          ],
          toolsUsed: ["OpenLCA", "ecoinvent"],
          evidenceSnippet: "Modeled prototype battery recycling workflows in OpenLCA",
        },
      ],
      projects: [
        {
          title: "Packaging Prototype Lifecycle Model",
          domain: "lca",
          description:
            "Built prototype LCI dataset in OpenLCA and ecoinvent to redesign material recovery.",
          toolsOrStandardsUsed: ["OpenLCA", "ecoinvent"],
          evidenceSnippet: "Built prototype LCI dataset in OpenLCA",
        },
      ],
      education: [],
      certificationsAndStandards: [],
      portfolioOrProfileUrls: [],
      roleKeywords: [],
      uncertaintyFlags: [],
    };

    const cleaned = cleanAndStandardizeExtraction(rawLlm, parsed);
    expect(cleaned.experiences[0]?.domain).toBe("lca_sustainability");
    expect(cleaned.projects[0]?.domain).toBe("lca");
    expect(cleaned.lcaProjectCount).toBe(1);
    expect(cleaned.uiuxProjectCount).toBe(0);
  });
});

