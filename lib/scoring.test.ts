import { describe, expect, it } from "vitest";
import { cleanAndStandardizeExtraction } from "./cleaner";
import { heuristicFallbackExtract } from "./llm/extractor";
import type { ParsedDocumentResult } from "./schemas";
import {
  classifyCandidate,
  evaluateForJD1,
  evaluateForJD2,
} from "./scoring";

function makeParsed(text: string, links: string[] = []): ParsedDocumentResult {
  return {
    fileType: "docx",
    status: "success",
    parserUsed: "mammoth+ooxml",
    normalizedText: text,
    rawHtmlPreview: null,
    charCount: text.length,
    wordCount: text.split(/\s+/).length,
    pageOrParagraphCount: 10,
    hadTablesOrTextBoxes: false,
    extractedHyperlinks: links,
    diagnostics: [],
  };
}

describe("Classification & Ranking Engine (JD1 vs JD2)", () => {
  it("classifies a 3-year GaBi/SimaPro ISO 14040/14044 candidate with 3 LCA projects as lca_stronger", () => {
    const parsed = makeParsed(`
      SUMMARY
      LCA Consultant with 3 years of experience in sustainability consulting.
      SKILLS
      GaBi, SimaPro, ecoinvent, Life Cycle Assessment, LCI data collection, data validation, public benchmarking, ISO 14040, ISO 14044, EPD, logistics data, stakeholder management.
      EXPERIENCE
      LCA Consultant | GreenFootprint Pvt Ltd | Jan 2023 - Jan 2026
      - Collected plant-level LCI datasets, performed data validation and LCA modelling in GaBi and SimaPro.
      PROJECTS
      1. Automotive Component Cradle-to-Gate LCA Study
      - Completed LCA study in SimaPro following ISO 14040 and ISO 14044.
      2. Cement Manufacturing EPD & LCI Benchmarking Project
      - Conducted LCA modeling in GaBi and prepared EPD documentation.
      3. Packaging Supply Chain Carbon Footprint LCA
      - Executed comparative LCA study across inbound logistics routes.
      EDUCATION
      M.Sc in Environmental Engineering, 2022
    `);

    const raw = heuristicFallbackExtract("lca_candidate.docx", parsed);
    const cleaned = cleanAndStandardizeExtraction(raw, parsed);
    const jd1 = evaluateForJD1(cleaned, parsed);
    const jd2 = evaluateForJD2(cleaned, parsed);
    const result = classifyCandidate(jd1, jd2, parsed);

    expect(jd1.totalScore).toBeGreaterThanOrEqual(85);
    expect(jd2.totalScore).toBeLessThan(30);
    expect(result.classification).toBe("lca_stronger");
  });

  it("classifies an early-career Figma & UX research designer with portfolio link as uiux_stronger", () => {
    const parsed = makeParsed(
      `
      SUMMARY
      Creative UI/UX Designer Intern passionate about human-centered design, user psychology, and sustainability.
      SKILLS
      Figma, FigJam, Prototyping, Wireframing, User Research, Usability Testing, User Psychology, Design Systems, Responsive Web Design, Design Critiques.
      EXPERIENCE
      UI/UX Design Intern | ImpactHub Studio | May 2025 - Oct 2025
      - Conducted user research interviews and built high-fidelity Figma prototypes for a remote sustainability job board.
      PROJECTS
      EcoBoard Job Portal Redesign
      - Created wireframes, user flows, and Figma design system for a climate job board.
      GreenCart Mobile App Case Study
      - Led usability testing and cognitive psychology heuristics evaluation.
      EDUCATION
      B.Des in Interaction Design, 2025
      `,
      ["https://www.behance.net/gallery/123456/uiux-portfolio"]
    );

    const raw = heuristicFallbackExtract("uiux_intern.docx", parsed);
    const cleaned = cleanAndStandardizeExtraction(raw, parsed);
    const jd1 = evaluateForJD1(cleaned, parsed);
    const jd2 = evaluateForJD2(cleaned, parsed);
    const result = classifyCandidate(jd1, jd2, parsed);

    expect(jd2.totalScore).toBeGreaterThanOrEqual(80);
    expect(jd1.totalScore).toBeLessThan(25);
    expect(result.classification).toBe("uiux_stronger");
  });

  it("classifies a candidate strong in both LCA and UI/UX within margin as both", () => {
    const parsed = makeParsed(
      `
      SUMMARY
      Sustainability Product Designer & LCA Researcher bridging environmental assessment with human-centered interfaces.
      SKILLS
      GaBi, SimaPro, ISO 14040, ISO 14044, Life Cycle Inventory, Figma, Prototyping, Wireframing, User Research, User Psychology, Design Systems.
      EXPERIENCE
      LCA & Sustainable UX Specialist | CircularTech | Jan 2023 - Jan 2025
      - Built LCI datasets in GaBi following ISO 14040 and designed interactive Figma sustainability dashboards.
      PROJECTS
      Battery Recycling LCA Study
      - Executed LCA study in SimaPro for EV battery packs.
      Circular UX Sustainability Job Board
      - Built high-fidelity Figma prototype and ran usability testing.
      EDUCATION
      M.Sc in Sustainability & Interaction Design, 2022
      `,
      ["https://www.figma.com/file/hybrid-portfolio"]
    );

    const raw = heuristicFallbackExtract("hybrid.docx", parsed);
    const cleaned = cleanAndStandardizeExtraction(raw, parsed);
    const jd1 = evaluateForJD1(cleaned, parsed);
    const jd2 = evaluateForJD2(cleaned, parsed);
    const result = classifyCandidate(jd1, jd2, parsed);

    expect(jd1.totalScore).toBeGreaterThanOrEqual(45);
    expect(jd2.totalScore).toBeGreaterThanOrEqual(45);
    expect(result.classification).toBe("both");
  });

  it("routes unrelated or failed parses to neither_uncertain", () => {
    const parsed = makeParsed(`
      SUMMARY
      Backend Java & SQL Developer with 5 years in banking ERP systems.
      SKILLS
      Java, Spring Boot, Oracle SQL, Docker, Kubernetes, Microservices.
      EXPERIENCE
      Software Engineer | FinBank | Jan 2021 - Jan 2026
      - Maintained payment settlement APIs.
      EDUCATION
      B.Tech in Computer Science, 2020
    `);

    const raw = heuristicFallbackExtract("backend.docx", parsed);
    const cleaned = cleanAndStandardizeExtraction(raw, parsed);
    const jd1 = evaluateForJD1(cleaned, parsed);
    const jd2 = evaluateForJD2(cleaned, parsed);
    const result = classifyCandidate(jd1, jd2, parsed);

    expect(jd1.totalScore).toBeLessThan(45);
    expect(jd2.totalScore).toBeLessThan(45);
    expect(result.classification).toBe("neither_uncertain");
  });
});

