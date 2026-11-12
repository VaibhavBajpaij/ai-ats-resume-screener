import type {
  ComputedExperience,
  DiagnosticIssue,
  DomainTag,
  ParsedDocumentResult,
  RawExperienceEntry,
  RawLLMExtraction,
  RawProjectEntry,
  StandardizedEducationEntry,
  StandardizedSkill,
} from "./schemas";
import {
  SKILL_TAXONOMY,
  aliasMatchesText,
  resolveCanonicalSkill,
} from "./taxonomy";
import { extractAndCleanUrls } from "./parsers/text-normalizer";

const PLACEHOLDER_STRINGS = new Set([
  "",
  "n/a",
  "na",
  "none",
  "null",
  "unknown",
  "not specified",
  "not mentioned",
  "-",
  "--",
]);

export function sanitizeTextValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(/<[^>]+>/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (PLACEHOLDER_STRINGS.has(cleaned.toLowerCase())) return null;
  return cleaned;
}

const MONTH_MAP: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

/**
 * Parses fuzzy resume date strings into an absolute month index (year * 12 + month).
 */
export function parseFuzzyMonthYear(
  raw: string | null | undefined,
  referenceDate: Date = new Date("2026-11-12T00:00:00Z"),
  isEndDate = false
): number | null {
  const cleaned = sanitizeTextValue(raw);
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();

  if (
    /\b(present|current|currently|ongoing|now|till\s*date|to\s*date)\b/i.test(
      lower
    )
  ) {
    return referenceDate.getUTCFullYear() * 12 + referenceDate.getUTCMonth();
  }

  // MM/YYYY or MM-YYYY
  const numericSlash = lower.match(/\b(0?[1-9]|1[0-2])\s*[\/-]\s*((?:19|20)\d{2})\b/);
  if (numericSlash) {
    const month = Number(numericSlash[1]) - 1;
    const year = Number(numericSlash[2]);
    return year * 12 + month;
  }

  // YYYY-MM
  const isoMatch = lower.match(/\b((?:19|20)\d{2})-(0?[1-9]|1[0-2])\b/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]) - 1;
    return year * 12 + month;
  }

  // Month YYYY or Month 'YY (e.g., "Jan 2023", "September 2021", "May '24")
  const monthWordMatch = lower.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b[\s,.'-]*((?:19|20)\d{2}|'?\d{2})\b/
  );
  if (monthWordMatch) {
    const month = MONTH_MAP[monthWordMatch[1]];
    const yearStr = monthWordMatch[2].replace("'", "");
    let year = Number(yearStr);
    if (yearStr.length === 2) {
      year += year >= 70 ? 1900 : 2000;
    }
    if (month !== undefined && year >= 1970 && year <= 2035) {
      return year * 12 + month;
    }
  }

  // Year only: YYYY
  const yearOnly = lower.match(/\b((?:19|20)\d{2})\b/);
  if (yearOnly) {
    const year = Number(yearOnly[1]);
    return year * 12 + (isEndDate ? 11 : 0);
  }

  return null;
}

export interface MonthInterval {
  start: number;
  end: number;
}

/**
 * Merges overlapping [start, end] month intervals so concurrent jobs/internships
 * do not inflate total or domain-specific years of experience.
 */
export function mergeIntervalsAndCountMonths(
  intervals: MonthInterval[]
): number {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: MonthInterval[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.start <= last.end + 1) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }

  return merged.reduce(
    (sum, interval) => sum + Math.max(1, interval.end - interval.start + 1),
    0
  );
}

const LCA_STRICT_REGEX =
  /\b(openlca|ecoinvent|gabi|simapro|lca|life\s*cycle|lifecycle|lci|iso\s*14040|iso\s*14044|epd|environmental\s*product\s*declaration|ghg\s*accounting|carbon\s*footprint|sustainability\s*analyst|sustainability\s*consultant)\b/i;

function inferDomainFromExperienceText(exp: RawExperienceEntry): DomainTag {
  const combined = [
    exp.title ?? "",
    exp.organization ?? "",
    ...exp.responsibilities,
    ...exp.toolsUsed,
  ]
    .join(" ")
    .toLowerCase();

  // Guard clause: LCA software or core LCA keywords strictly win and cannot be overwritten by generic UI/UX terms
  if (LCA_STRICT_REGEX.test(combined)) {
    return "lca_sustainability";
  }

  const hasUiuxSignals =
    /\b(ui\/ux|ux\/ui|ui\s*ux|ux\s*designer|ui\s*designer|product\s*designer|interaction\s*design|figma|wirefram|prototyp|usability\s*testing|user\s*research|design\s*system)\b/i.test(
      combined
    );

  if (hasUiuxSignals) return "uiux_design";
  return exp.domain;
}

function resolveProjectDomain(
  combinedProj: string,
  currentDomain: RawProjectEntry["domain"]
): RawProjectEntry["domain"] {
  // Guard clause: projects referencing LCA software or LCA/life-cycle terminology strictly map to "lca"
  if (LCA_STRICT_REGEX.test(combinedProj)) {
    return "lca";
  }
  if (
    /\b(ui\/ux|ux\/ui|figma|wirefram|prototyp|usability|user\s*research|redesign|app\s*design|website\s*design)\b/i.test(
      combinedProj
    )
  ) {
    return "uiux";
  }
  return currentDomain;
}

function isTokenGrounded(
  candidateText: string,
  corpusLower: string
): boolean {
  const cleaned = candidateText.toLowerCase().trim();
  if (!cleaned) return false;
  if (corpusLower.includes(cleaned)) return true;

  const tokens = cleaned
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !["and", "the", "for", "with"].includes(t));
  if (tokens.length === 0) return false;

  const matched = tokens.filter((t) => corpusLower.includes(t));
  return matched.length / tokens.length >= 0.6;
}

function extractContextSnippet(text: string, alias: string): string | null {
  const idx = text.toLowerCase().indexOf(alias.toLowerCase());
  if (idx === -1) return null;
  const start = Math.max(0, idx - 45);
  const end = Math.min(text.length, idx + alias.length + 75);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function normalizeEducationLevel(
  degreeRaw: string | null
): StandardizedEducationEntry["normalizedLevel"] {
  if (!degreeRaw) return "unknown";
  const d = degreeRaw.toLowerCase();
  if (/\b(ph\.?d|doctorate|doctoral)\b/i.test(d)) return "phd";
  if (
    /\b(m\.?\s*tech|m\.?\s*sc|m\.?\s*s\.?|m\.?\s*des|mba|master|masters|post\s*grad|pgdm)\b/i.test(
      d
    )
  ) {
    return "masters";
  }
  if (
    /\b(b\.?\s*tech|b\.?\s*e\.?|b\.?\s*sc|b\.?\s*des|b\.?\s*a\.?|bachelor|undergrad)\b/i.test(
      d
    )
  ) {
    return "bachelors";
  }
  if (/\b(diploma|certificate|certification|bootcamp|associate)\b/i.test(d)) {
    return "diploma_or_cert";
  }
  return "unknown";
}

export interface CleanedProfileOutput {
  summary: string | null;
  skills: StandardizedSkill[];
  experience: ComputedExperience;
  experiences: RawExperienceEntry[];
  projects: RawProjectEntry[];
  lcaProjectCount: number;
  uiuxProjectCount: number;
  education: StandardizedEducationEntry[];
  standardsMatched: string[];
  portfolioLinks: string[];
  keywords: string[];
  cleaningAuditLog: string[];
  diagnostics: DiagnosticIssue[];
}

/**
 * Deterministic Post-LLM Sanitization & Standardization Layer.
 * Verifies AI claims against source text, normalizes aliases via taxonomy,
 * merges overlapping date intervals per domain, and logs every transformation.
 */
export function cleanAndStandardizeExtraction(
  raw: RawLLMExtraction,
  parsed: ParsedDocumentResult,
  referenceDate: Date = new Date("2026-11-12T00:00:00Z")
): CleanedProfileOutput {
  const auditLog: string[] = [];
  const diagnostics: DiagnosticIssue[] = [];
  const sourceText = parsed.normalizedText;
  const corpusLower = `${sourceText}\n${parsed.extractedHyperlinks.join(" ")}`.toLowerCase();

  // 1. Clean Summary
  const summary = sanitizeTextValue(raw.professionalSummary);

  // 2. Clean, Verify, and Standardize Skills
  const skillMap = new Map<string, StandardizedSkill>();
  let strippedHallucinatedCount = 0;

  for (const rawSkill of raw.skills) {
    const cleanName = sanitizeTextValue(rawSkill.rawName);
    if (!cleanName) continue;

    const taxonomyMatch = resolveCanonicalSkill(cleanName);
    const canonicalName = taxonomyMatch ? taxonomyMatch.canonicalName : cleanName;
    const category = taxonomyMatch
      ? taxonomyMatch.category
      : "general_tech_or_soft";

    const verifiedByAlias = taxonomyMatch
      ? taxonomyMatch.aliases.some((alias) => aliasMatchesText(corpusLower, alias))
      : false;
    const verifiedByRaw =
      aliasMatchesText(corpusLower, cleanName) ||
      isTokenGrounded(rawSkill.evidenceSnippet, corpusLower);
    const verifiedInSourceText = verifiedByAlias || verifiedByRaw;

    if (!verifiedInSourceText) {
      strippedHallucinatedCount++;
      auditLog.push(
        `Stripped uncorroborated skill "${cleanName}" — not found in parsed resume text.`
      );
      continue;
    }

    if (taxonomyMatch && cleanName.toLowerCase() !== canonicalName.toLowerCase()) {
      auditLog.push(
        `Normalized skill alias "${cleanName}" -> "${canonicalName}".`
      );
    }

    const key = canonicalName.toLowerCase();
    const existing = skillMap.get(key);
    const snippet =
      sanitizeTextValue(rawSkill.evidenceSnippet) ??
      extractContextSnippet(sourceText, cleanName);

    if (existing) {
      if (!existing.rawAliasesMatched.includes(cleanName)) {
        existing.rawAliasesMatched.push(cleanName);
      }
    } else {
      skillMap.set(key, {
        canonicalName,
        category,
        rawAliasesMatched: [cleanName],
        verifiedInSourceText: true,
        evidenceSnippet: snippet,
      });
    }
  }

  // Deterministic taxonomy recovery pass (catches explicit skills missed by LLM)
  for (const entry of SKILL_TAXONOMY) {
    const matchedAlias = entry.aliases.find((alias) =>
      aliasMatchesText(corpusLower, alias)
    );
    if (!matchedAlias) continue;

    const key = entry.canonicalName.toLowerCase();
    if (!skillMap.has(key)) {
      const snippet = extractContextSnippet(sourceText, matchedAlias);
      skillMap.set(key, {
        canonicalName: entry.canonicalName,
        category: entry.category,
        rawAliasesMatched: [matchedAlias],
        verifiedInSourceText: true,
        evidenceSnippet: snippet,
      });
      auditLog.push(
        `Recovered verified taxonomy skill "${entry.canonicalName}" (matched "${matchedAlias}") via deterministic text scan.`
      );
    }
  }

  if (strippedHallucinatedCount > 0) {
    diagnostics.push({
      stage: "cleaning",
      severity: "warning",
      code: "WARN_CLEANER_STRIPPED_UNGROUNDED_SKILLS",
      message: `Removed ${strippedHallucinatedCount} skill claim(s) not corroborated in source text.`,
    });
  }

  const skills = Array.from(skillMap.values());

  // 3. Clean Experiences & Merge Overlapping Date Intervals
  const allIntervals: MonthInterval[] = [];
  const lcaIntervals: MonthInterval[] = [];
  const uiuxIntervals: MonthInterval[] = [];
  let reportedFallbackLcaMonths = 0;
  let reportedFallbackUiuxMonths = 0;
  let reportedFallbackTotalMonths = 0;

  const cleanedExperiences: RawExperienceEntry[] = raw.experiences.map((exp) => {
    const title = sanitizeTextValue(exp.title);
    const organization = sanitizeTextValue(exp.organization);
    const startDateRaw = sanitizeTextValue(exp.startDateRaw);
    const endDateRaw = sanitizeTextValue(exp.endDateRaw);
    const evidenceSnippet = sanitizeTextValue(exp.evidenceSnippet) ?? "";

    const correctedDomain = inferDomainFromExperienceText({
      ...exp,
      title,
      organization,
    });
    if (correctedDomain !== exp.domain) {
      auditLog.push(
        `Reclassified experience "${title ?? "Untitled"}" domain "${exp.domain}" -> "${correctedDomain}" based on role/tool keywords.`
      );
    }

    const startMonth = parseFuzzyMonthYear(startDateRaw, referenceDate, false);
    let endMonth = parseFuzzyMonthYear(endDateRaw, referenceDate, true);
    if (startMonth !== null && endMonth === null) {
      // Single date or missing end date -> conservative 1 month unless duration reported
      const extraMonths =
        exp.durationMonthsReported && exp.durationMonthsReported > 0
          ? Math.min(120, Math.round(exp.durationMonthsReported) - 1)
          : 0;
      endMonth = startMonth + extraMonths;
    }

    if (startMonth !== null && endMonth !== null && endMonth >= startMonth) {
      // Guard against obviously broken multi-decade spans (>35 yrs)
      const clampedEnd = Math.min(endMonth, startMonth + 420);
      const interval = { start: startMonth, end: clampedEnd };
      allIntervals.push(interval);
      if (correctedDomain === "lca_sustainability") {
        lcaIntervals.push(interval);
      } else if (correctedDomain === "uiux_design") {
        uiuxIntervals.push(interval);
      }
    } else if (
      exp.durationMonthsReported !== null &&
      exp.durationMonthsReported > 0 &&
      exp.durationMonthsReported <= 240
    ) {
      const m = Math.round(exp.durationMonthsReported);
      reportedFallbackTotalMonths += m;
      if (correctedDomain === "lca_sustainability") {
        reportedFallbackLcaMonths += m;
      } else if (correctedDomain === "uiux_design") {
        reportedFallbackUiuxMonths += m;
      }
      auditLog.push(
        `Experience "${title ?? "Untitled"}" lacked parseable dates; used reported duration (${m} mo) as fallback.`
      );
    }

    return {
      title,
      organization,
      startDateRaw,
      endDateRaw,
      durationMonthsReported: exp.durationMonthsReported,
      domain: correctedDomain,
      responsibilities: exp.responsibilities
        .map((r) => sanitizeTextValue(r))
        .filter((r): r is string => Boolean(r)),
      toolsUsed: exp.toolsUsed
        .map((t) => sanitizeTextValue(t))
        .filter((t): t is string => Boolean(t)),
      evidenceSnippet,
    };
  });

  let totalMonths = mergeIntervalsAndCountMonths(allIntervals);
  let lcaMonths = mergeIntervalsAndCountMonths(lcaIntervals);
  let uiuxMonths = mergeIntervalsAndCountMonths(uiuxIntervals);
  let calculationMethod: ComputedExperience["calculationMethod"] =
    allIntervals.length > 0 ? "date_interval_merge" : "none";

  if (allIntervals.length === 0 && reportedFallbackTotalMonths > 0) {
    totalMonths = reportedFallbackTotalMonths;
    lcaMonths = reportedFallbackLcaMonths;
    uiuxMonths = reportedFallbackUiuxMonths;
    calculationMethod = "reported_fallback";
  } else if (
    allIntervals.length === 0 &&
    (raw.totalExperienceYearsReported !== null ||
      raw.lcaExperienceYearsReported !== null ||
      raw.uiuxExperienceYearsReported !== null)
  ) {
    totalMonths = Math.max(
      0,
      Math.round((raw.totalExperienceYearsReported ?? 0) * 12)
    );
    lcaMonths = Math.max(
      0,
      Math.round((raw.lcaExperienceYearsReported ?? 0) * 12)
    );
    uiuxMonths = Math.max(
      0,
      Math.round((raw.uiuxExperienceYearsReported ?? 0) * 12)
    );
    calculationMethod = "reported_fallback";
    auditLog.push(
      "No interval dates found on experiences; fell back to explicit reported experience years."
    );
  }

  const totalYears = Number((totalMonths / 12).toFixed(1));
  const lcaYears = Number((lcaMonths / 12).toFixed(1));
  const uiuxYears = Number((uiuxMonths / 12).toFixed(1));

  // Flag LLM math discrepancies
  let llmDiscrepancyFlag = false;
  const discrepancyNotes: string[] = [];
  if (
    raw.lcaExperienceYearsReported !== null &&
    Math.abs(raw.lcaExperienceYearsReported - lcaYears) > 0.75
  ) {
    llmDiscrepancyFlag = true;
    discrepancyNotes.push(
      `Reported LCA years (${raw.lcaExperienceYearsReported}) vs merged LCA interval years (${lcaYears}).`
    );
  }
  if (
    raw.totalExperienceYearsReported !== null &&
    Math.abs(raw.totalExperienceYearsReported - totalYears) > 1.0
  ) {
    llmDiscrepancyFlag = true;
    discrepancyNotes.push(
      `Reported total years (${raw.totalExperienceYearsReported}) vs merged interval years (${totalYears}).`
    );
  }
  const discrepancyNote =
    discrepancyNotes.length > 0 ? discrepancyNotes.join(" ") : null;
  if (discrepancyNote) {
    auditLog.push(`Experience math discrepancy detected: ${discrepancyNote}`);
  }

  // 4. Clean & Deduplicate Projects
  const seenProjects = new Set<string>();
  const cleanedProjects: RawProjectEntry[] = [];
  for (const proj of raw.projects) {
    const title = sanitizeTextValue(proj.title);
    const description = sanitizeTextValue(proj.description) ?? "";
    const evidenceSnippet = sanitizeTextValue(proj.evidenceSnippet) ?? "";
    if (!title && !description) continue;

    const dedupKey = (title ?? description.slice(0, 60)).toLowerCase();
    if (seenProjects.has(dedupKey)) {
      auditLog.push(`Deduplicated repeated project entry "${title ?? dedupKey}".`);
      continue;
    }
    seenProjects.add(dedupKey);

    const combinedProj = `${title ?? ""} ${description} ${proj.toolsOrStandardsUsed.join(" ")}`.toLowerCase();
    const domain = resolveProjectDomain(combinedProj, proj.domain);
    if (domain !== proj.domain) {
      auditLog.push(
        `Reclassified project "${title ?? "Untitled"}" domain "${proj.domain}" -> "${domain}".`
      );
    }

    cleanedProjects.push({
      title,
      domain,
      description,
      toolsOrStandardsUsed: proj.toolsOrStandardsUsed
        .map((t) => sanitizeTextValue(t))
        .filter((t): t is string => Boolean(t)),
      evidenceSnippet,
    });
  }

  const lcaProjectCount = cleanedProjects.filter((p) => p.domain === "lca").length;
  const uiuxProjectCount = cleanedProjects.filter((p) => p.domain === "uiux").length;

  // 5. Standardize Education
  const education: StandardizedEducationEntry[] = raw.education
    .map((edu) => {
      const degreeRaw = sanitizeTextValue(edu.degreeRaw);
      const fieldOfStudy = sanitizeTextValue(edu.fieldOfStudy);
      const institution = sanitizeTextValue(edu.institution);
      const graduationYear = sanitizeTextValue(edu.graduationYear);
      const textCombined = `${degreeRaw ?? ""} ${fieldOfStudy ?? ""}`.toLowerCase();

      const isEnvironmentalDomain =
        edu.isEnvironmentalDomain ||
        /\b(environment(?:al)?|sustainab(?:le|ility)|climate|ecolog(?:y|ical)|chemical|energy|forestry|waste|water|green|civil)\b/i.test(
          textCombined
        );
      const isDesignDomain =
        edu.isDesignDomain ||
        /\b(design(?:ing)?|hci|human[\s-]computer|interaction|visual|graphic|multimedia|ux|ui|fine\s*arts|communication)\b/i.test(
          textCombined
        );

      return {
        degreeRaw,
        fieldOfStudy,
        institution,
        graduationYear,
        isEnvironmentalDomain,
        isDesignDomain,
        normalizedLevel: normalizeEducationLevel(degreeRaw),
      };
    })
    .filter((edu) => edu.degreeRaw || edu.fieldOfStudy || edu.institution);

  // 6. Standards & Portfolio URLs & Keywords
  const standardsSet = new Set<string>();
  for (const skill of skills) {
    if (skill.category === "lca_methodology_standard") {
      standardsSet.add(skill.canonicalName);
    }
  }
  for (const std of raw.certificationsAndStandards) {
    const resolved = resolveCanonicalSkill(std);
    if (resolved && aliasMatchesText(corpusLower, std)) {
      standardsSet.add(resolved.canonicalName);
    }
  }
  const standardsMatched = Array.from(standardsSet);

  const portfolioLinks = extractAndCleanUrls(
    "",
    [...parsed.extractedHyperlinks, ...raw.portfolioOrProfileUrls]
  );

  const keywordSet = new Set<string>(skills.map((s) => s.canonicalName));
  for (const kw of raw.roleKeywords) {
    const cleaned = sanitizeTextValue(kw);
    if (cleaned && aliasMatchesText(corpusLower, cleaned)) {
      keywordSet.add(cleaned);
    }
  }

  for (const flag of raw.uncertaintyFlags) {
    const cleanedFlag = sanitizeTextValue(flag);
    if (cleanedFlag) {
      diagnostics.push({
        stage: "llm_extraction",
        severity: "warning",
        code: "WARN_LLM_EXTRACTION_UNCERTAINTY",
        message: cleanedFlag,
      });
    }
  }

  return {
    summary,
    skills,
    experience: {
      totalMonths,
      totalYears,
      lcaMonths,
      lcaYears,
      uiuxMonths,
      uiuxYears,
      calculationMethod,
      llmDiscrepancyFlag,
      discrepancyNote,
    },
    experiences: cleanedExperiences,
    projects: cleanedProjects,
    lcaProjectCount,
    uiuxProjectCount,
    education,
    standardsMatched,
    portfolioLinks,
    keywords: Array.from(keywordSet),
    cleaningAuditLog: auditLog,
    diagnostics,
  };
}

