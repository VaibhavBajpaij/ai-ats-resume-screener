import { z } from "zod";

export const RoleIdSchema = z.enum(["jd1_lca", "jd2_uiux"]);
export type RoleId = z.infer<typeof RoleIdSchema>;

export const ClassificationCategorySchema = z.enum([
  "lca_stronger",
  "uiux_stronger",
  "both",
  "neither_uncertain",
]);
export type ClassificationCategory = z.infer<typeof ClassificationCategorySchema>;

export const DomainTagSchema = z.enum([
  "lca_sustainability",
  "uiux_design",
  "software_engineering",
  "other",
]);
export type DomainTag = z.infer<typeof DomainTagSchema>;

export const ParseStatusSchema = z.enum(["success", "partial", "failed"]);
export type ParseStatus = z.infer<typeof ParseStatusSchema>;

/**
 * 1. Canonical Job Description Schema (JD1 & JD2)
 */
export const JobProfileSchema = z.object({
  id: RoleIdSchema,
  title: z.string(),
  shortTitle: z.string(),
  sourceUrl: z.string().url(),
  experienceRequirementLabel: z.string(),
  targetMinYears: z.number(),
  targetMaxYears: z.number(),
  location: z.string(),
  mandatoryTools: z.array(z.string()),
  preferredTools: z.array(z.string()),
  mandatoryStandardsOrMethods: z.array(z.string()),
  minRelevantProjects: z.number().int().nonnegative(),
  desiredEducationDomains: z.array(z.string()),
  keywords: z.array(z.string()),
  summary: z.string(),
  scoringWeights: z.record(z.string(), z.number()),
});
export type JobProfile = z.infer<typeof JobProfileSchema>;

/**
 * 2. Raw LLM Output Schema (Pre-Cleaning, Strictly Grounded)
 */
export const RawExperienceEntrySchema = z.object({
  title: z.string().nullable(),
  organization: z.string().nullable(),
  startDateRaw: z.string().nullable(),
  endDateRaw: z.string().nullable(),
  durationMonthsReported: z.number().nullable(),
  domain: DomainTagSchema,
  responsibilities: z.array(z.string()),
  toolsUsed: z.array(z.string()),
  evidenceSnippet: z.string().max(300),
});
export type RawExperienceEntry = z.infer<typeof RawExperienceEntrySchema>;

export const RawProjectEntrySchema = z.object({
  title: z.string().nullable(),
  domain: z.enum(["lca", "uiux", "other"]),
  description: z.string(),
  toolsOrStandardsUsed: z.array(z.string()),
  evidenceSnippet: z.string().max(300),
});
export type RawProjectEntry = z.infer<typeof RawProjectEntrySchema>;

export const RawEducationEntrySchema = z.object({
  degreeRaw: z.string().nullable(),
  fieldOfStudy: z.string().nullable(),
  institution: z.string().nullable(),
  graduationYear: z.string().nullable(),
  isEnvironmentalDomain: z.boolean(),
  isDesignDomain: z.boolean(),
});
export type RawEducationEntry = z.infer<typeof RawEducationEntrySchema>;

export const RawSkillEntrySchema = z.object({
  rawName: z.string(),
  domainHint: DomainTagSchema,
  evidenceSnippet: z.string().max(240),
});
export type RawSkillEntry = z.infer<typeof RawSkillEntrySchema>;

export const RawLLMExtractionSchema = z.object({
  candidateLabel: z.string().nullable(),
  professionalSummary: z.string().nullable(),
  totalExperienceYearsReported: z.number().nullable(),
  lcaExperienceYearsReported: z.number().nullable(),
  uiuxExperienceYearsReported: z.number().nullable(),
  skills: z.array(RawSkillEntrySchema),
  experiences: z.array(RawExperienceEntrySchema),
  projects: z.array(RawProjectEntrySchema),
  education: z.array(RawEducationEntrySchema),
  certificationsAndStandards: z.array(z.string()),
  portfolioOrProfileUrls: z.array(z.string()),
  roleKeywords: z.array(z.string()),
  uncertaintyFlags: z.array(z.string()),
});
export type RawLLMExtraction = z.infer<typeof RawLLMExtractionSchema>;

/**
 * 3. Cleaned & Standardized Candidate Schema (Post-AI Sanitization)
 */
export const DiagnosticIssueSchema = z.object({
  stage: z.enum([
    "ingestion",
    "parsing",
    "llm_extraction",
    "cleaning",
    "classification",
  ]),
  severity: z.enum(["error", "warning", "info"]),
  code: z.string(),
  message: z.string(),
});
export type DiagnosticIssue = z.infer<typeof DiagnosticIssueSchema>;

export const SkillCategorySchema = z.enum([
  "lca_software",
  "lca_methodology_standard",
  "sustainability_domain",
  "uiux_tool",
  "uiux_methodology",
  "general_tech_or_soft",
]);
export type SkillCategory = z.infer<typeof SkillCategorySchema>;

export const StandardizedSkillSchema = z.object({
  canonicalName: z.string(),
  category: SkillCategorySchema,
  rawAliasesMatched: z.array(z.string()),
  verifiedInSourceText: z.boolean(),
  evidenceSnippet: z.string().nullable(),
});
export type StandardizedSkill = z.infer<typeof StandardizedSkillSchema>;

export const ComputedExperienceSchema = z.object({
  totalMonths: z.number().int().nonnegative(),
  totalYears: z.number().nonnegative(),
  lcaMonths: z.number().int().nonnegative(),
  lcaYears: z.number().nonnegative(),
  uiuxMonths: z.number().int().nonnegative(),
  uiuxYears: z.number().nonnegative(),
  calculationMethod: z.enum([
    "date_interval_merge",
    "reported_fallback",
    "none",
  ]),
  llmDiscrepancyFlag: z.boolean(),
  discrepancyNote: z.string().nullable(),
});
export type ComputedExperience = z.infer<typeof ComputedExperienceSchema>;

export const EvidenceCitationSchema = z.object({
  criterion: z.string(),
  pointsAwarded: z.number(),
  maxPoints: z.number(),
  matchedItems: z.array(z.string()),
  sourceSection: z.enum([
    "skills",
    "experience",
    "projects",
    "education",
    "links",
    "derived",
  ]),
  evidenceSnippet: z.string().nullable(),
});
export type EvidenceCitation = z.infer<typeof EvidenceCitationSchema>;

export const RoleMatchEvaluationSchema = z.object({
  roleId: RoleIdSchema,
  totalScore: z.number().min(0).max(100),
  rankInRole: z.number().int().positive().nullable(),
  breakdown: z.record(z.string(), z.number()),
  evidenceCitations: z.array(EvidenceCitationSchema),
  missingRequirements: z.array(z.string()),
  explanationSummary: z.string(),
});
export type RoleMatchEvaluation = z.infer<typeof RoleMatchEvaluationSchema>;

export const StandardizedEducationEntrySchema = RawEducationEntrySchema.extend({
  normalizedLevel: z.enum([
    "phd",
    "masters",
    "bachelors",
    "diploma_or_cert",
    "unknown",
  ]),
});
export type StandardizedEducationEntry = z.infer<
  typeof StandardizedEducationEntrySchema
>;

export const CandidateRecordSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  source: z.object({
    filename: z.string(),
    fileType: z.enum(["docx", "pdf", "txt", "unknown"]),
    fileSizeBytes: z.number().int().nonnegative(),
    origin: z.enum(["zoho_corpus", "user_upload"]),
    zohoResourceId: z.string().nullable(),
    zohoFolderUrl: z.string().nullable(),
    zohoFileUrl: z.string().nullable(),
    localDownloadUrl: z.string().nullable(),
    processedAtIso: z.string(),
  }),
  parsing: z.object({
    status: ParseStatusSchema,
    parserUsed: z.string(),
    extractionMode: z.enum([
      "llm_structured",
      "heuristic_fallback",
      "skipped_due_to_parse_error",
    ]),
    charCount: z.number().int().nonnegative(),
    wordCount: z.number().int().nonnegative(),
    pageOrParagraphCount: z.number().int().nonnegative(),
    hadTablesOrTextBoxes: z.boolean(),
    extractedHyperlinks: z.array(z.string()),
    rawTextExcerpt: z.string(),
    rawHtmlPreview: z.string().nullable(),
  }),
  extracted: z.object({
    summary: z.string().nullable(),
    skills: z.array(StandardizedSkillSchema),
    experience: ComputedExperienceSchema,
    experiences: z.array(RawExperienceEntrySchema),
    projects: z.array(RawProjectEntrySchema),
    lcaProjectCount: z.number().int().nonnegative(),
    uiuxProjectCount: z.number().int().nonnegative(),
    education: z.array(StandardizedEducationEntrySchema),
    standardsMatched: z.array(z.string()),
    portfolioLinks: z.array(z.string()),
    keywords: z.array(z.string()),
  }),
  evaluation: z.object({
    classification: ClassificationCategorySchema,
    confidence: z.enum(["high", "medium", "low"]),
    classificationReason: z.string(),
    jd1: RoleMatchEvaluationSchema,
    jd2: RoleMatchEvaluationSchema,
  }),
  cleaningAuditLog: z.array(z.string()),
  diagnostics: z.array(DiagnosticIssueSchema),
});
export type CandidateRecord = z.infer<typeof CandidateRecordSchema>;

export const ProcessedDatasetSchema = z.object({
  generatedAtIso: z.string(),
  totalResumes: z.number().int().nonnegative(),
  zohoFolderUrl: z.string().url(),
  jobProfiles: z.object({
    jd1: JobProfileSchema,
    jd2: JobProfileSchema,
  }),
  summaryCounts: z.object({
    lca_stronger: z.number().int().nonnegative(),
    uiux_stronger: z.number().int().nonnegative(),
    both: z.number().int().nonnegative(),
    neither_uncertain: z.number().int().nonnegative(),
    parseSuccess: z.number().int().nonnegative(),
    parsePartial: z.number().int().nonnegative(),
    parseFailed: z.number().int().nonnegative(),
  }),
  candidates: z.array(CandidateRecordSchema),
});
export type ProcessedDataset = z.infer<typeof ProcessedDatasetSchema>;

export interface ParsedDocumentResult {
  fileType: "docx" | "pdf" | "txt" | "unknown";
  status: ParseStatus;
  parserUsed: string;
  normalizedText: string;
  rawHtmlPreview: string | null;
  charCount: number;
  wordCount: number;
  pageOrParagraphCount: number;
  hadTablesOrTextBoxes: boolean;
  extractedHyperlinks: string[];
  diagnostics: DiagnosticIssue[];
}

