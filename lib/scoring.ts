import type { CleanedProfileOutput } from "./cleaner";
import { aliasMatchesText } from "./taxonomy";
import type {
  CandidateRecord,
  ClassificationCategory,
  DiagnosticIssue,
  EvidenceCitation,
  ParsedDocumentResult,
  RoleMatchEvaluation,
} from "./schemas";

const MIN_QUALIFY_THRESHOLD = 45;
const STRONG_BOTH_THRESHOLD = 58;
const DOMINANCE_MARGIN = 12;

function hasCanonicalSkill(
  cleaned: CleanedProfileOutput,
  name: string
): boolean {
  return cleaned.skills.some(
    (s) =>
      s.verifiedInSourceText &&
      s.canonicalName.toLowerCase() === name.toLowerCase()
  );
}

function getSkillSnippet(
  cleaned: CleanedProfileOutput,
  name: string
): string | null {
  return (
    cleaned.skills.find(
      (s) =>
        s.verifiedInSourceText &&
        s.canonicalName.toLowerCase() === name.toLowerCase()
    )?.evidenceSnippet ?? null
  );
}

function roundScore(val: number): number {
  return Math.round(Math.max(0, Math.min(100, val)) * 10) / 10;
}

/**
 * Evaluates a cleaned candidate profile against JD1 (LCA Consultant).
 * Total: 100 pts = Software (18) + Core LCI/LCA Skills (17) + Verified LCA Years (25)
 *                 + LCA Projects (20) + ISO Standards (10) + Education & Fit (10)
 */
export function evaluateForJD1(
  cleaned: CleanedProfileOutput,
  parsed: ParsedDocumentResult
): RoleMatchEvaluation {
  if (parsed.status === "failed") {
    return {
      roleId: "jd1_lca",
      totalScore: 0,
      rankInRole: null,
      breakdown: {
        "LCA Software": 0,
        "LCI/LCA Core Skills": 0,
        "Verified LCA Experience": 0,
        "LCA Projects": 0,
        "ISO Standards": 0,
        "Education & Preferred Fit": 0,
      },
      evidenceCitations: [],
      missingRequirements: ["Document parsing failed — unable to evaluate JD1."],
      explanationSummary:
        "Score 0/100 because source document could not be parsed cleanly.",
    };
  }

  const text = parsed.normalizedText;
  const citations: EvidenceCitation[] = [];
  const missing: string[] = [];

  // 1. LCA Software (18 pts)
  const hasGabi = hasCanonicalSkill(cleaned, "GaBi");
  const hasSimaPro = hasCanonicalSkill(cleaned, "SimaPro");
  const adjacentTools = [
    "OpenLCA",
    "ecoinvent",
    "Umberto",
    "One Click LCA",
    "GREET",
  ].filter((tool) => hasCanonicalSkill(cleaned, tool));

  let softwarePts = 0;
  const matchedSoftware: string[] = [];
  if (hasGabi) matchedSoftware.push("GaBi");
  if (hasSimaPro) matchedSoftware.push("SimaPro");
  matchedSoftware.push(...adjacentTools);

  if (hasGabi && hasSimaPro) {
    softwarePts = 18;
  } else if (hasGabi || hasSimaPro) {
    softwarePts = 15 + Math.min(2, adjacentTools.length);
  } else if (adjacentTools.length >= 2) {
    softwarePts = 10;
    missing.push("Missing mandatory GaBi or SimaPro (adjacent LCA tools found)");
  } else if (adjacentTools.length === 1) {
    softwarePts = 8;
    missing.push("Missing mandatory GaBi or SimaPro (adjacent LCA tool found)");
  } else {
    missing.push("No GaBi, SimaPro, or LCA modeling software evidenced");
  }

  if (matchedSoftware.length > 0) {
    citations.push({
      criterion: "LCA Software Expertise",
      pointsAwarded: softwarePts,
      maxPoints: 18,
      matchedItems: matchedSoftware,
      sourceSection: "skills",
      evidenceSnippet:
        getSkillSnippet(cleaned, matchedSoftware[0]) ?? matchedSoftware.join(", "),
    });
  }

  // 2. LCI & LCA Core Skills (17 pts)
  const coreSkillWeights: Array<[string, number]> = [
    ["Life Cycle Assessment (LCA)", 4],
    ["Life Cycle Inventory (LCI)", 3.5],
    ["Data Validation & QC", 2.5],
    ["Operational & Logistics Data", 2.5],
    ["Public Benchmarking", 2],
    ["LCIA", 2],
    ["Carbon Footprint", 1.5],
    ["ESG & Sustainability Reporting", 1.5],
  ];
  let coreSkillPts = 0;
  const matchedCoreSkills: string[] = [];
  for (const [skillName, pts] of coreSkillWeights) {
    if (hasCanonicalSkill(cleaned, skillName)) {
      coreSkillPts += pts;
      matchedCoreSkills.push(skillName);
    }
  }
  coreSkillPts = Math.min(17, Math.round(coreSkillPts * 10) / 10);
  if (matchedCoreSkills.length > 0) {
    citations.push({
      criterion: "LCI & LCA Core Methodology",
      pointsAwarded: coreSkillPts,
      maxPoints: 17,
      matchedItems: matchedCoreSkills,
      sourceSection: "skills",
      evidenceSnippet: getSkillSnippet(cleaned, matchedCoreSkills[0]),
    });
  } else {
    missing.push("Missing LCI data collection, LCA modeling, or data validation skills");
  }

  // 3. Verified LCA Experience (25 pts) — Peak across 2–6 years per directive
  const lcaYears = cleaned.experience.lcaYears;
  let expPts = 0;
  if (lcaYears >= 2 && lcaYears <= 6) {
    expPts = 25;
  } else if (lcaYears > 6) {
    expPts = 21;
  } else if (lcaYears >= 1) {
    expPts = 17;
    missing.push(
      `Verified LCA experience is ${lcaYears} yrs (below 2–6 yr target window)`
    );
  } else if (lcaYears >= 0.25) {
    expPts = 10;
    missing.push(
      `Limited LCA experience (${lcaYears} yrs; target is 2–6 yrs)`
    );
  } else if (
    cleaned.lcaProjectCount > 0 ||
    hasGabi ||
    hasSimaPro ||
    hasCanonicalSkill(cleaned, "Life Cycle Assessment (LCA)")
  ) {
    expPts = 4;
    missing.push("No full-time/dated LCA industry experience detected (0 yrs)");
  } else {
    missing.push("0 verified years of LCA/sustainability experience");
  }

  if (expPts > 0) {
    const lcaRoles = cleaned.experiences
      .filter((e) => e.domain === "lca_sustainability")
      .map((e) => `${e.title ?? "Role"} (${e.startDateRaw ?? "?"}–${e.endDateRaw ?? "?"})`);
    citations.push({
      criterion: "Verified LCA Experience (2–6 yrs peak)",
      pointsAwarded: expPts,
      maxPoints: 25,
      matchedItems:
        lcaRoles.length > 0
          ? lcaRoles
          : [`${lcaYears} yrs LCA experience (${cleaned.experience.calculationMethod})`],
      sourceSection: "experience",
      evidenceSnippet:
        cleaned.experiences.find((e) => e.domain === "lca_sustainability")
          ?.evidenceSnippet ?? null,
    });
  }

  // 4. LCA Project History (20 pts; JD1 requires >= 3 LCA projects)
  const explicitProjectCountMention = text.match(
    /\b([3-9]|\d{2})\+?\s+(?:independent\s+)?lca\s+(?:projects|studies)\b/i
  );
  const effectiveLcaProjects = Math.max(
    cleaned.lcaProjectCount,
    explicitProjectCountMention ? Number(explicitProjectCountMention[1]) : 0
  );
  const hasLcaExpStudyMention = cleaned.experiences.some(
    (e) =>
      e.domain === "lca_sustainability" &&
      /\b(lca|life\s*cycle|lci|epd)\b/i.test(e.responsibilities.join(" "))
  );

  let projectPts = 0;
  if (effectiveLcaProjects >= 3) {
    projectPts = 20;
  } else if (effectiveLcaProjects === 2) {
    projectPts = 14;
    missing.push("2 LCA projects evidenced (JD1 prefers >= 3 completed LCA projects)");
  } else if (effectiveLcaProjects === 1) {
    projectPts = 8;
    missing.push("Only 1 LCA project evidenced (JD1 prefers >= 3)");
  } else if (hasLcaExpStudyMention) {
    projectPts = 5;
    missing.push("LCA work mentioned inside roles, but <3 discrete LCA projects itemized");
  } else {
    missing.push("No completed LCA projects evidenced (JD1 requires >= 3)");
  }

  if (projectPts > 0) {
    const lcaProjTitles = cleaned.projects
      .filter((p) => p.domain === "lca")
      .map((p) => p.title ?? "LCA Project");
    citations.push({
      criterion: "LCA Project History",
      pointsAwarded: projectPts,
      maxPoints: 20,
      matchedItems:
        lcaProjTitles.length > 0
          ? lcaProjTitles
          : [`${effectiveLcaProjects} LCA project signal(s)`],
      sourceSection: "projects",
      evidenceSnippet:
        cleaned.projects.find((p) => p.domain === "lca")?.evidenceSnippet ?? null,
    });
  }

  // 5. ISO Standards & EPD (10 pts)
  const hasIso14040 = hasCanonicalSkill(cleaned, "ISO 14040");
  const hasIso14044 = hasCanonicalSkill(cleaned, "ISO 14044");
  const hasEpdOrCarbonStd =
    hasCanonicalSkill(cleaned, "EPD") ||
    hasCanonicalSkill(cleaned, "ISO 14067 / PCF") ||
    hasCanonicalSkill(cleaned, "GHG Protocol / ISO 14064");

  const stdPts =
    (hasIso14040 ? 4 : 0) + (hasIso14044 ? 4 : 0) + (hasEpdOrCarbonStd ? 2 : 0);
  const matchedStandards: string[] = [];
  if (hasIso14040) matchedStandards.push("ISO 14040");
  if (hasIso14044) matchedStandards.push("ISO 14044");
  if (hasCanonicalSkill(cleaned, "EPD")) matchedStandards.push("EPD");
  if (hasCanonicalSkill(cleaned, "ISO 14067 / PCF"))
    matchedStandards.push("ISO 14067 / PCF");
  if (hasCanonicalSkill(cleaned, "GHG Protocol / ISO 14064"))
    matchedStandards.push("GHG Protocol / ISO 14064");

  if (!hasIso14040 || !hasIso14044) {
    missing.push("Missing explicit ISO 14040 and/or ISO 14044 standard compliance");
  }
  if (stdPts > 0) {
    citations.push({
      criterion: "ISO Standards & EPD Compliance",
      pointsAwarded: stdPts,
      maxPoints: 10,
      matchedItems: matchedStandards,
      sourceSection: "skills",
      evidenceSnippet: getSkillSnippet(cleaned, matchedStandards[0]),
    });
  }

  // 6. Education & Preferred Fit (10 pts)
  const envDegrees = cleaned.education.filter((e) => e.isEnvironmentalDomain);
  let eduPts = 0;
  const matchedEdu: string[] = [];
  if (envDegrees.some((e) => e.normalizedLevel === "masters" || e.normalizedLevel === "phd")) {
    eduPts = 8;
    matchedEdu.push(
      ...envDegrees.map((e) => `${e.degreeRaw ?? "Degree"} (${e.fieldOfStudy ?? "Env"})`)
    );
  } else if (envDegrees.length > 0) {
    eduPts = 6.5;
    matchedEdu.push(
      ...envDegrees.map((e) => `${e.degreeRaw ?? "Degree"} (${e.fieldOfStudy ?? "Env"})`)
    );
  } else if (cleaned.education.length > 0) {
    eduPts = 2;
    matchedEdu.push(
      ...cleaned.education.map((e) => e.degreeRaw ?? e.fieldOfStudy ?? "Degree")
    );
    missing.push("Degree is outside Environmental/Sustainability domain");
  } else {
    missing.push("No academic degree extracted");
  }

  let preferredBonus = 0;
  const prefMatched: string[] = [];
  if (hasCanonicalSkill(cleaned, "Business Finance & Accounting")) {
    preferredBonus += 1;
    prefMatched.push("Business Finance & Accounting");
  }
  if (
    hasCanonicalSkill(cleaned, "Stakeholder Management") ||
    aliasMatchesText(text, "chennai") ||
    aliasMatchesText(text, "relocate")
  ) {
    preferredBonus += 1;
    prefMatched.push("Stakeholder/Client Readiness");
  }
  const totalEduPts = Math.min(10, Math.round((eduPts + preferredBonus) * 10) / 10);

  if (totalEduPts > 0) {
    citations.push({
      criterion: "Education & Preferred Qualifications",
      pointsAwarded: totalEduPts,
      maxPoints: 10,
      matchedItems: [...matchedEdu, ...prefMatched],
      sourceSection: "education",
      evidenceSnippet: matchedEdu[0] ?? null,
    });
  }

  const totalScore = roundScore(
    softwarePts + coreSkillPts + expPts + projectPts + stdPts + totalEduPts
  );

  const explanationParts: string[] = [];
  explanationParts.push(`JD1 Score ${totalScore}/100.`);
  if (matchedSoftware.length > 0) {
    explanationParts.push(`Software: ${matchedSoftware.join(", ")}.`);
  }
  explanationParts.push(
    `Verified LCA experience: ${lcaYears} yrs; LCA projects: ${effectiveLcaProjects}.`
  );
  if (matchedStandards.length > 0) {
    explanationParts.push(`Standards: ${matchedStandards.join(", ")}.`);
  }
  if (missing.length > 0 && totalScore < 80) {
    explanationParts.push(`Key gaps: ${missing.slice(0, 2).join("; ")}.`);
  }

  return {
    roleId: "jd1_lca",
    totalScore,
    rankInRole: null,
    breakdown: {
      "LCA Software": softwarePts,
      "LCI/LCA Core Skills": coreSkillPts,
      "Verified LCA Experience": expPts,
      "LCA Projects": projectPts,
      "ISO Standards": stdPts,
      "Education & Preferred Fit": totalEduPts,
    },
    evidenceCitations: citations,
    missingRequirements: missing,
    explanationSummary: explanationParts.join(" "),
  };
}

/**
 * Evaluates a cleaned candidate profile against JD2 (UI/UX Design Internship).
 * Total: 100 pts = Figma/Tools (30) + UX Research/Psychology (25) + Portfolio/Projects (25)
 *                 + Experience Band 0-1.5 yrs (10) + Domain Signals (10)
 */
export function evaluateForJD2(
  cleaned: CleanedProfileOutput,
  parsed: ParsedDocumentResult
): RoleMatchEvaluation {
  if (parsed.status === "failed") {
    return {
      roleId: "jd2_uiux",
      totalScore: 0,
      rankInRole: null,
      breakdown: {
        "Figma & Design Tools": 0,
        "UX Research & Psychology": 0,
        "Portfolio & Projects": 0,
        "Intern Experience Fit": 0,
        "Domain & Collaboration": 0,
      },
      evidenceCitations: [],
      missingRequirements: ["Document parsing failed — unable to evaluate JD2."],
      explanationSummary:
        "Score 0/100 because source document could not be parsed cleanly.",
    };
  }

  const text = parsed.normalizedText;
  const citations: EvidenceCitation[] = [];
  const missing: string[] = [];

  // 1. Figma & Design Tools (30 pts)
  const hasFigma = hasCanonicalSkill(cleaned, "Figma");
  const secondaryTools = [
    "Adobe XD",
    "Sketch",
    "Framer",
    "Penpot",
    "ProtoPie",
    "Webflow",
    "Miro",
    "Canva",
    "Adobe Creative Suite",
  ].filter((t) => hasCanonicalSkill(cleaned, t));

  const figmaPts = hasFigma ? 20 : 0;
  const secondaryPts = Math.min(10, secondaryTools.length * 3.5);
  const toolsPts = Math.min(30, Math.round((figmaPts + secondaryPts) * 10) / 10);
  const matchedTools = [
    ...(hasFigma ? ["Figma"] : []),
    ...secondaryTools,
  ];

  if (!hasFigma) {
    missing.push("Missing mandatory Figma proficiency");
  }
  if (matchedTools.length > 0) {
    citations.push({
      criterion: "Figma & Prototyping Tools",
      pointsAwarded: toolsPts,
      maxPoints: 30,
      matchedItems: matchedTools,
      sourceSection: "skills",
      evidenceSnippet: getSkillSnippet(cleaned, matchedTools[0]),
    });
  }

  // 2. UX Research, Principles & Psychology (25 pts)
  const uxMethodWeights: Array<[string, number]> = [
    ["UI/UX Design", 5],
    ["Prototyping", 4.5],
    ["Wireframing", 4],
    ["User Research", 4],
    ["User Psychology & HCD", 4],
    ["Usability Testing", 2.5],
    ["Information Architecture", 2.5],
    ["Design Systems & Visual Design", 2.5],
    ["Design Critiques", 1.5],
  ];
  let uxMethodPts = 0;
  const matchedMethods: string[] = [];
  for (const [name, pts] of uxMethodWeights) {
    if (hasCanonicalSkill(cleaned, name)) {
      uxMethodPts += pts;
      matchedMethods.push(name);
    }
  }
  uxMethodPts = Math.min(25, Math.round(uxMethodPts * 10) / 10);

  if (matchedMethods.length > 0) {
    citations.push({
      criterion: "UX Principles, Research & User Psychology",
      pointsAwarded: uxMethodPts,
      maxPoints: 25,
      matchedItems: matchedMethods,
      sourceSection: "skills",
      evidenceSnippet: getSkillSnippet(cleaned, matchedMethods[0]),
    });
  } else {
    missing.push("No UX research, wireframing, prototyping, or HCD methods evidenced");
  }

  // 3. Portfolio Links & UI/UX Projects (25 pts)
  const designPortfolioUrls = cleaned.portfolioLinks.filter((u) =>
    /(figma\.com|behance\.net|dribbble\.com|framer\.|webflow\.|notion\.|wixsite\.|cargo\.|portfolio|uxfolio|read\.cv)/i.test(
      u
    )
  );
  const otherUrls = cleaned.portfolioLinks.filter(
    (u) => !designPortfolioUrls.includes(u)
  );
  const hasUiuxSignals =
    hasFigma ||
    matchedMethods.length > 0 ||
    cleaned.uiuxProjectCount > 0 ||
    cleaned.experience.uiuxYears > 0;

  let projectPts = 0;
  const hasUiuxInternshipExp = cleaned.experiences.some(
    (e) => e.domain === "uiux_design"
  );
  if (cleaned.uiuxProjectCount >= 3) {
    projectPts = 16;
  } else if (cleaned.uiuxProjectCount === 2) {
    projectPts = 12;
  } else if (cleaned.uiuxProjectCount === 1) {
    projectPts = 7;
  } else if (hasUiuxInternshipExp) {
    projectPts = 5;
  } else {
    missing.push("No discrete UI/UX projects or case studies evidenced");
  }

  let linkPts = 0;
  if (designPortfolioUrls.length > 0) {
    linkPts = 9;
  } else if (otherUrls.length > 0 && hasUiuxSignals) {
    linkPts = 4;
    missing.push("General URL found, but no dedicated Figma/Behance/Dribbble portfolio link");
  } else {
    missing.push("No design portfolio URL detected");
  }

  const portfolioTotalPts = Math.min(25, projectPts + linkPts);
  if (portfolioTotalPts > 0) {
    const uiuxProjTitles = cleaned.projects
      .filter((p) => p.domain === "uiux")
      .map((p) => p.title ?? "UI/UX Project");
    citations.push({
      criterion: "Portfolio & UI/UX Case Studies",
      pointsAwarded: portfolioTotalPts,
      maxPoints: 25,
      matchedItems: [...uiuxProjTitles, ...designPortfolioUrls],
      sourceSection: designPortfolioUrls.length > 0 ? "links" : "projects",
      evidenceSnippet:
        cleaned.projects.find((p) => p.domain === "uiux")?.evidenceSnippet ??
        designPortfolioUrls[0] ??
        null,
    });
  }

  // 4. Experience Alignment: 0–1.5 yrs Internship Band (10 pts)
  const uiuxYears = cleaned.experience.uiuxYears;
  const hasDesignEducation = cleaned.education.some((e) => e.isDesignDomain);
  let expPts = 0;
  if (hasUiuxSignals || hasDesignEducation) {
    if (uiuxYears <= 1.5) {
      expPts = 10;
    } else if (uiuxYears <= 3.0) {
      expPts = 7;
    } else {
      expPts = 4;
      missing.push(
        `Candidate has ${uiuxYears} yrs UI/UX experience (may be overqualified for 0–1 yr internship)`
      );
    }
  } else {
    missing.push("No UI/UX experience, projects, or design education signals");
  }

  if (expPts > 0) {
    citations.push({
      criterion: "Internship Band Fit (0–1.5 yrs)",
      pointsAwarded: expPts,
      maxPoints: 10,
      matchedItems: [`${uiuxYears} yrs UI/UX experience`],
      sourceSection: "experience",
      evidenceSnippet:
        cleaned.experiences.find((e) => e.domain === "uiux_design")
          ?.evidenceSnippet ?? null,
    });
  }

  // 5. Domain & Collaboration Fit (10 pts)
  let domainPts = 0;
  const domainMatches: string[] = [];
  if (hasCanonicalSkill(cleaned, "Responsive Web & Product UI")) {
    domainPts += 4;
    domainMatches.push("Responsive Web / Product UI");
  }
  if (
    /\b(sustainab|climate|green|social\s*impact|esg|environment|clean\s*tech)\b/i.test(
      text
    ) &&
    hasUiuxSignals
  ) {
    domainPts += 3;
    domainMatches.push("Sustainability / Impact Interest");
  }
  if (
    hasCanonicalSkill(cleaned, "Stakeholder Management") ||
    hasCanonicalSkill(cleaned, "Design Critiques") ||
    /\b(cross[\s-]functional|collaborat|remote|developer|engineer|product\s*manager)\b/i.test(
      text
    )
  ) {
    domainPts += 3;
    domainMatches.push("Cross-functional Collaboration");
  }
  domainPts = Math.min(10, domainPts);
  if (domainPts > 0) {
    citations.push({
      criterion: "Domain & Collaboration Signals",
      pointsAwarded: domainPts,
      maxPoints: 10,
      matchedItems: domainMatches,
      sourceSection: "derived",
      evidenceSnippet: domainMatches.join(", "),
    });
  }

  const totalScore = roundScore(
    toolsPts + uxMethodPts + portfolioTotalPts + expPts + domainPts
  );

  const explanationParts: string[] = [];
  explanationParts.push(`JD2 Score ${totalScore}/100.`);
  if (matchedTools.length > 0) {
    explanationParts.push(`Tools: ${matchedTools.join(", ")}.`);
  }
  explanationParts.push(
    `UI/UX projects: ${cleaned.uiuxProjectCount}; UI/UX experience: ${uiuxYears} yrs.`
  );
  if (designPortfolioUrls.length > 0) {
    explanationParts.push(
      `Portfolio URL(s): ${designPortfolioUrls.slice(0, 2).join(", ")}.`
    );
  }
  if (missing.length > 0 && totalScore < 80) {
    explanationParts.push(`Key gaps: ${missing.slice(0, 2).join("; ")}.`);
  }

  return {
    roleId: "jd2_uiux",
    totalScore,
    rankInRole: null,
    breakdown: {
      "Figma & Design Tools": toolsPts,
      "UX Research & Psychology": uxMethodPts,
      "Portfolio & Projects": portfolioTotalPts,
      "Intern Experience Fit": expPts,
      "Domain & Collaboration": domainPts,
    },
    evidenceCitations: citations,
    missingRequirements: missing,
    explanationSummary: explanationParts.join(" "),
  };
}

/**
 * Classifies candidate into 4 mutually exclusive categories using the 45-point
 * minimum qualification threshold and 12-point margin rule.
 */
export function classifyCandidate(
  jd1: RoleMatchEvaluation,
  jd2: RoleMatchEvaluation,
  parsed: ParsedDocumentResult
): {
  classification: ClassificationCategory;
  confidence: "high" | "medium" | "low";
  classificationReason: string;
} {
  if (parsed.status === "failed") {
    return {
      classification: "neither_uncertain",
      confidence: "low",
      classificationReason:
        "Document parsing failed or extracted insufficient text; routed to Neither / Uncertain for human inspection.",
    };
  }

  const s1 = jd1.totalScore;
  const s2 = jd2.totalScore;
  const diff = Math.abs(s1 - s2);

  if (s1 < MIN_QUALIFY_THRESHOLD && s2 < MIN_QUALIFY_THRESHOLD) {
    return {
      classification: "neither_uncertain",
      confidence: s1 < 25 && s2 < 25 ? "high" : "medium",
      classificationReason: `Neither role met the ${MIN_QUALIFY_THRESHOLD}-point qualification threshold (JD1: ${s1}, JD2: ${s2}).`,
    };
  }

  if (
    (s1 >= MIN_QUALIFY_THRESHOLD &&
      s2 >= MIN_QUALIFY_THRESHOLD &&
      diff < DOMINANCE_MARGIN) ||
    (s1 >= STRONG_BOTH_THRESHOLD && s2 >= STRONG_BOTH_THRESHOLD)
  ) {
    return {
      classification: "both",
      confidence: s1 >= 60 && s2 >= 60 ? "high" : "medium",
      classificationReason: `Qualified for both roles within margin (JD1: ${s1}, JD2: ${s2}, Δ=${diff.toFixed(1)} < ${DOMINANCE_MARGIN} or both >= ${STRONG_BOTH_THRESHOLD}).`,
    };
  }

  if (s1 >= MIN_QUALIFY_THRESHOLD && (s2 < MIN_QUALIFY_THRESHOLD || s1 - s2 >= DOMINANCE_MARGIN)) {
    return {
      classification: "lca_stronger",
      confidence: s1 >= 68 && s1 - s2 >= 20 ? "high" : "medium",
      classificationReason: `Stronger match for LCA Consultant (JD1: ${s1} vs JD2: ${s2}, lead +${(s1 - s2).toFixed(1)} pts).`,
    };
  }

  return {
    classification: "uiux_stronger",
    confidence: s2 >= 68 && s2 - s1 >= 20 ? "high" : "medium",
    classificationReason: `Stronger match for UI/UX Design Intern (JD2: ${s2} vs JD1: ${s1}, lead +${(s2 - s1).toFixed(1)} pts).`,
  };
}

/**
 * Assigns dense/competition ranks across all candidates independently for JD1 and JD2.
 * Returns a new sorted/ranked array without mutating inputs.
 */
export function assignRoleRanks(
  candidates: CandidateRecord[]
): CandidateRecord[] {
  const byJd1 = [...candidates].sort(
    (a, b) =>
      b.evaluation.jd1.totalScore - a.evaluation.jd1.totalScore ||
      b.extracted.experience.lcaYears - a.extracted.experience.lcaYears ||
      a.displayName.localeCompare(b.displayName)
  );
  const byJd2 = [...candidates].sort(
    (a, b) =>
      b.evaluation.jd2.totalScore - a.evaluation.jd2.totalScore ||
      b.extracted.uiuxProjectCount - a.extracted.uiuxProjectCount ||
      a.displayName.localeCompare(b.displayName)
  );

  const jd1RankMap = new Map<string, number>();
  byJd1.forEach((c, idx) => jd1RankMap.set(c.id, idx + 1));

  const jd2RankMap = new Map<string, number>();
  byJd2.forEach((c, idx) => jd2RankMap.set(c.id, idx + 1));

  return candidates.map((c) => ({
    ...c,
    evaluation: {
      ...c.evaluation,
      jd1: {
        ...c.evaluation.jd1,
        rankInRole: jd1RankMap.get(c.id) ?? null,
      },
      jd2: {
        ...c.evaluation.jd2,
        rankInRole: jd2RankMap.get(c.id) ?? null,
      },
    },
  }));
}

export function buildDisplayName(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "");
  const anonymizedMatch = base.match(/^anonymized_([A-Za-z0-9]+)_(\d+)$/i);
  if (anonymizedMatch) {
    return `${anonymizedMatch[1].toUpperCase()} · #${anonymizedMatch[2].slice(-4)}`;
  }
  return base;
}

export function collectDiagnostics(
  ...groups: DiagnosticIssue[][]
): DiagnosticIssue[] {
  return groups.flat();
}

