import { createHash } from "node:crypto";
import { cleanAndStandardizeExtraction } from "./cleaner";
import { ZOHO_FOLDER_URL } from "./job-descriptions";
import { extractResumeProfile } from "./llm/extractor";
import { parseResumeBuffer } from "./parsers";
import { CandidateRecordSchema, type CandidateRecord } from "./schemas";
import {
  buildDisplayName,
  classifyCandidate,
  collectDiagnostics,
  evaluateForJD1,
  evaluateForJD2,
} from "./scoring";

export interface ProcessResumeInput {
  buffer: Buffer;
  filename: string;
  origin: "zoho_corpus" | "user_upload";
  zohoResourceId?: string | null;
  zohoFileUrl?: string | null;
  localDownloadUrl?: string | null;
  referenceDate?: Date;
}

/**
 * Shared Tier-1 & Tier-2 resume processing pipeline:
 * 1. Magic-byte route + DOCX/PDF parsing
 * 2. Gemini 1.5 Flash structured extraction (with heuristic fallback)
 * 3. Deterministic cleaning, taxonomy normalization, evidence verification & date math
 * 4. JD1 & JD2 scoring + 4-category classification + Zod schema validation
 */
export async function processResumeBuffer(
  input: ProcessResumeInput
): Promise<CandidateRecord> {
  const {
    buffer,
    filename,
    origin,
    zohoResourceId = null,
    zohoFileUrl = null,
    localDownloadUrl = null,
    referenceDate = new Date("2026-11-12T00:00:00Z"),
  } = input;

  const parsed = await parseResumeBuffer(buffer, filename);
  const extraction = await extractResumeProfile(filename, parsed);
  const cleaned = cleanAndStandardizeExtraction(
    extraction.rawExtraction,
    parsed,
    referenceDate
  );

  const jd1 = evaluateForJD1(cleaned, parsed);
  const jd2 = evaluateForJD2(cleaned, parsed);
  const classification = classifyCandidate(jd1, jd2, parsed);

  const hashSuffix = createHash("sha1")
    .update(`${origin}:${filename}:${buffer.length}`)
    .digest("hex")
    .slice(0, 8);
  const safeSlug = filename
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const id = `${safeSlug || "resume"}-${hashSuffix}`;

  const record: CandidateRecord = {
    id,
    displayName: buildDisplayName(filename),
    source: {
      filename,
      fileType: parsed.fileType,
      fileSizeBytes: buffer.length,
      origin,
      zohoResourceId,
      zohoFolderUrl: origin === "zoho_corpus" ? ZOHO_FOLDER_URL : null,
      zohoFileUrl,
      localDownloadUrl,
      processedAtIso: new Date().toISOString(),
    },
    parsing: {
      status: parsed.status,
      parserUsed: parsed.parserUsed,
      extractionMode: extraction.extractionMode,
      charCount: parsed.charCount,
      wordCount: parsed.wordCount,
      pageOrParagraphCount: parsed.pageOrParagraphCount,
      hadTablesOrTextBoxes: parsed.hadTablesOrTextBoxes,
      extractedHyperlinks: parsed.extractedHyperlinks,
      rawTextExcerpt: parsed.normalizedText.slice(0, 12000),
      rawHtmlPreview: parsed.rawHtmlPreview
        ? parsed.rawHtmlPreview.slice(0, 24000)
        : null,
    },
    extracted: {
      summary: cleaned.summary,
      skills: cleaned.skills,
      experience: cleaned.experience,
      experiences: cleaned.experiences,
      projects: cleaned.projects,
      lcaProjectCount: cleaned.lcaProjectCount,
      uiuxProjectCount: cleaned.uiuxProjectCount,
      education: cleaned.education,
      standardsMatched: cleaned.standardsMatched,
      portfolioLinks: cleaned.portfolioLinks,
      keywords: cleaned.keywords,
    },
    evaluation: {
      classification: classification.classification,
      confidence: classification.confidence,
      classificationReason: classification.classificationReason,
      jd1,
      jd2,
    },
    cleaningAuditLog: cleaned.cleaningAuditLog,
    diagnostics: collectDiagnostics(
      parsed.diagnostics,
      extraction.diagnostics,
      cleaned.diagnostics
    ),
  };

  return CandidateRecordSchema.parse(record);
}

