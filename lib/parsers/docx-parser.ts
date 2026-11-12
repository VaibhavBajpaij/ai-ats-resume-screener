import JSZip from "jszip";
import mammoth from "mammoth";
import type { DiagnosticIssue, ParsedDocumentResult } from "@/lib/schemas";
import {
  countWords,
  extractAndCleanUrls,
  normalizeDocumentText,
} from "./text-normalizer";

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

/**
 * Extracts text from OOXML paragraph/table/textbox nodes, keeping line boundaries.
 */
function extractTextFromWordXml(xml: string): {
  fullText: string;
  textBoxLines: string[];
  hasTables: boolean;
  hasTextBoxes: boolean;
} {
  const hasTables = /<w:tbl[\s>]/i.test(xml);
  const hasTextBoxes = /<w:txbxContent[\s>]/i.test(xml);

  const extractRuns = (fragment: string): string[] => {
    const paragraphs = fragment.split(/<\/w:p>/i);
    const lines: string[] = [];
    for (const para of paragraphs) {
      // Preserve cell separation inside tables
      const withTabBreaks = para
        .replace(/<\/w:tc>/gi, " | ")
        .replace(/<w:tab\b[^>]*\/>/gi, " ")
        .replace(/<w:br\b[^>]*\/>/gi, "\n");
      const textTokens = Array.from(
        withTabBreaks.matchAll(/<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>/gi)
      ).map((m) => decodeXmlEntities(m[1]));
      const line = textTokens.join("").replace(/[ \t]+/g, " ").trim();
      if (line) {
        lines.push(line);
      }
    }
    return lines;
  };

  const fullText = extractRuns(xml).join("\n");

  const textBoxLines: string[] = [];
  for (const match of xml.matchAll(
    /<w:txbxContent\b[^>]*>([\s\S]*?)<\/w:txbxContent>/gi
  )) {
    textBoxLines.push(...extractRuns(match[1]));
  }

  return { fullText, textBoxLines, hasTables, hasTextBoxes };
}

function sanitizeHtmlPreview(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "");
}

/**
 * Parses a .docx buffer using mammoth for primary text/HTML plus a supplementary
 * OOXML extractor (jszip) to recover text boxes, headers/footers, and hyperlinks.
 */
export async function parseDocxBuffer(
  buffer: Buffer
): Promise<ParsedDocumentResult> {
  const diagnostics: DiagnosticIssue[] = [];

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "corrupt ZIP structure";
    console.error(`[docx-parser] ERR_DOCX_CORRUPT_ARCHIVE: ${errMsg}`);
    diagnostics.push({
      stage: "parsing",
      severity: "error",
      code: "ERR_DOCX_CORRUPT_ARCHIVE",
      message: `Unable to open .docx zip archive: ${errMsg}`,
    });
    return {
      fileType: "docx",
      status: "failed",
      parserUsed: "mammoth+ooxml",
      normalizedText: "",
      rawHtmlPreview: null,
      charCount: 0,
      wordCount: 0,
      pageOrParagraphCount: 0,
      hadTablesOrTextBoxes: false,
      extractedHyperlinks: [],
      diagnostics,
    };
  }

  const documentEntry = zip.file("word/document.xml");
  if (!documentEntry) {
    console.error("[docx-parser] ERR_DOCX_MISSING_DOCUMENT_XML: Missing word/document.xml");
    diagnostics.push({
      stage: "parsing",
      severity: "error",
      code: "ERR_DOCX_MISSING_DOCUMENT_XML",
      message:
        "Archive is missing word/document.xml; file may not be a valid Word .docx document.",
    });
    return {
      fileType: "docx",
      status: "failed",
      parserUsed: "mammoth+ooxml",
      normalizedText: "",
      rawHtmlPreview: null,
      charCount: 0,
      wordCount: 0,
      pageOrParagraphCount: 0,
      hadTablesOrTextBoxes: false,
      extractedHyperlinks: [],
      diagnostics,
    };
  }

  // 1. Primary extraction via mammoth (sequential try/catch blocks)
  let mammothText = "";
  let rawHtmlPreview: string | null = null;
  let mammothTextError: string | null = null;
  try {
    const rawRes = await mammoth.extractRawText({ buffer });
    mammothText = rawRes.value ?? "";

    if (rawRes.messages && rawRes.messages.length > 0) {
      const warnMessages = rawRes.messages
        .filter((m) => m.type === "warning" || m.type === "error")
        .slice(0, 3)
        .map((m) => m.message);
      if (warnMessages.length > 0) {
        diagnostics.push({
          stage: "parsing",
          severity: "info",
          code: "INFO_MAMMOTH_WARNINGS",
          message: `Mammoth notices: ${warnMessages.join("; ")}`,
        });
      }
    }
  } catch (err) {
    mammothTextError = err instanceof Error ? err.message : "unknown mammoth error";
    console.error(`[docx-parser] mammoth.extractRawText failed: ${mammothTextError}`);
    diagnostics.push({
      stage: "parsing",
      severity: "warning",
      code: "WARN_MAMMOTH_FAILED_USING_OOXML",
      message: `Mammoth extractRawText failed (${mammothTextError}); falling back to direct OOXML extraction.`,
    });
  }

  try {
    const htmlRes = await mammoth.convertToHtml({ buffer });
    rawHtmlPreview = htmlRes.value ? sanitizeHtmlPreview(htmlRes.value) : null;
  } catch (err) {
    const htmlErr = err instanceof Error ? err.message : "unknown HTML preview error";
    console.warn(`[docx-parser] mammoth.convertToHtml failed: ${htmlErr}`);
  }

  // 2. Supplementary OOXML extraction (document.xml, headers, footers, .rels)
  let hadTablesOrTextBoxes = false;
  const supplementaryLines: string[] = [];
  const rawHyperlinks: string[] = [];

  try {
    const docXml = await documentEntry.async("string");
    const docExtracted = extractTextFromWordXml(docXml);
    hadTablesOrTextBoxes =
      docExtracted.hasTables || docExtracted.hasTextBoxes;

    // If mammoth produced empty text, use full XML text directly
    if (!mammothText.trim() && docExtracted.fullText.trim()) {
      mammothText = docExtracted.fullText;
    }

    // Recover text boxes dropped by mammoth
    const mammothLower = mammothText.toLowerCase();
    for (const boxLine of docExtracted.textBoxLines) {
      if (
        boxLine.length > 2 &&
        !mammothLower.includes(boxLine.toLowerCase())
      ) {
        supplementaryLines.push(boxLine);
      }
    }

    // Extract headers & footers
    const headerFooterFiles = Object.keys(zip.files).filter((name) =>
      /^word\/(header|footer)\d*\.xml$/i.test(name)
    );
    for (const hfPath of headerFooterFiles) {
      const hfXml = await zip.file(hfPath)?.async("string");
      if (!hfXml) continue;
      const hfExtracted = extractTextFromWordXml(hfXml);
      for (const line of hfExtracted.fullText.split("\n")) {
        const trimmed = line.trim();
        if (
          trimmed.length > 2 &&
          !mammothLower.includes(trimmed.toLowerCase()) &&
          !supplementaryLines.includes(trimmed)
        ) {
          supplementaryLines.push(trimmed);
        }
      }
    }

    // Extract external hyperlinks from word/_rels/*.rels
    const relsFiles = Object.keys(zip.files).filter((name) =>
      /^word\/_rels\/.*\.rels$/i.test(name)
    );
    for (const relsPath of relsFiles) {
      const relsXml = await zip.file(relsPath)?.async("string");
      if (!relsXml) continue;
      for (const match of relsXml.matchAll(
        /<Relationship\b[^>]*TargetMode="External"[^>]*Target="([^"]+)"/gi
      )) {
        rawHyperlinks.push(decodeXmlEntities(match[1]));
      }
      // Also match attribute ordering where Target appears before TargetMode
      for (const match of relsXml.matchAll(
        /<Relationship\b[^>]*Target="([^"]+)"[^>]*TargetMode="External"/gi
      )) {
        rawHyperlinks.push(decodeXmlEntities(match[1]));
      }
    }
  } catch (err) {
    diagnostics.push({
      stage: "parsing",
      severity: "warning",
      code: "WARN_OOXML_SUPPLEMENTARY_PARTIAL",
      message: `Supplementary OOXML parsing hit a warning: ${err instanceof Error ? err.message : "unknown"}`,
    });
  }

  if (supplementaryLines.length > 0) {
    diagnostics.push({
      stage: "parsing",
      severity: "info",
      code: "INFO_EXTRACTED_FROM_TEXTBOX_OR_HEADER",
      message: `Recovered ${supplementaryLines.length} line(s) from DOCX text boxes or headers/footers omitted by mammoth.`,
    });
  }

  const combinedText = [mammothText, ...supplementaryLines]
    .filter(Boolean)
    .join("\n");
  const normalizedText = normalizeDocumentText(combinedText);
  const extractedHyperlinks = extractAndCleanUrls(normalizedText, rawHyperlinks);
  const charCount = normalizedText.length;
  const wordCount = countWords(normalizedText);
  const paragraphCount = normalizedText
    ? normalizedText.split("\n").filter(Boolean).length
    : 0;

  let status: ParsedDocumentResult["status"] = "success";
  if (charCount === 0 && mammothTextError) {
    status = "failed";
    diagnostics.push({
      stage: "parsing",
      severity: "error",
      code: "ERR_DOCX_CORRUPT_ARCHIVE",
      message: `DOCX extraction failed (${mammothTextError}) and OOXML fallback yielded no readable text.`,
    });
  } else if (charCount < 100) {
    status = "failed";
    diagnostics.push({
      stage: "parsing",
      severity: "error",
      code: "ERR_DOCX_IMAGE_ONLY",
      message:
        "DOCX contains fewer than 100 extractable characters; resume may consist of embedded images/screenshots.",
    });
  } else if (charCount < 350) {
    status = "partial";
    diagnostics.push({
      stage: "parsing",
      severity: "warning",
      code: "WARN_DOCX_SPARSE_CONTENT",
      message: `Extracted only ${charCount} characters (${wordCount} words); parts of the resume may be embedded as images.`,
    });
  }

  return {
    fileType: "docx",
    status,
    parserUsed:
      supplementaryLines.length > 0 || rawHyperlinks.length > 0
        ? "mammoth+ooxml"
        : "mammoth",
    normalizedText,
    rawHtmlPreview,
    charCount,
    wordCount,
    pageOrParagraphCount: paragraphCount,
    hadTablesOrTextBoxes,
    extractedHyperlinks,
    diagnostics,
  };
}

