import type { DiagnosticIssue, ParsedDocumentResult } from "@/lib/schemas";
import { parseDocxBuffer } from "./docx-parser";
import { parsePdfBuffer } from "./pdf-parser";
import {
  countWords,
  extractAndCleanUrls,
  normalizeDocumentText,
} from "./text-normalizer";

export const MAX_UPLOAD_BYTES = 4.5 * 1024 * 1024; // 4.5 MB Vercel Hobby limit

function startsWithBytes(buffer: Buffer, signature: number[]): boolean {
  if (buffer.length < signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (buffer[i] !== signature[i]) return false;
  }
  return true;
}

function makeFailedResult(
  fileType: ParsedDocumentResult["fileType"],
  parserUsed: string,
  code: string,
  message: string
): ParsedDocumentResult {
  const diagnostics: DiagnosticIssue[] = [
    {
      stage: "parsing",
      severity: "error",
      code,
      message,
    },
  ];
  return {
    fileType,
    status: "failed",
    parserUsed,
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

/**
 * Routes a resume buffer to the appropriate parser by inspecting magic bytes first,
 * falling back to filename extension only for plaintext files.
 */
export async function parseResumeBuffer(
  buffer: Buffer,
  filename: string
): Promise<ParsedDocumentResult> {
  if (!buffer || buffer.length === 0) {
    return makeFailedResult(
      "unknown",
      "magic-byte-router",
      "ERR_EMPTY_FILE",
      `Uploaded file "${filename}" is empty (0 bytes).`
    );
  }

  if (buffer.length > MAX_UPLOAD_BYTES) {
    return makeFailedResult(
      "unknown",
      "magic-byte-router",
      "ERR_FILE_TOO_LARGE",
      `File size (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds the 4.5 MB serverless upload limit.`
    );
  }

  // %PDF- (0x25 0x50 0x44 0x46 0x2D)
  if (startsWithBytes(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return parsePdfBuffer(buffer);
  }

  // PK\x03\x04 (0x50 0x4B 0x03 0x04) -> ZIP/OOXML (.docx)
  if (startsWithBytes(buffer, [0x50, 0x4b, 0x03, 0x04])) {
    return parseDocxBuffer(buffer);
  }

  // Legacy OLE Compound File binary .doc (0xD0 0xCF 0x11 0xE0)
  if (startsWithBytes(buffer, [0xd0, 0xcf, 0x11, 0xe0])) {
    return makeFailedResult(
      "unknown",
      "magic-byte-router",
      "ERR_LEGACY_DOC_UNSUPPORTED",
      `File "${filename}" uses the legacy binary Word 97-2003 (.doc) format. Please convert it to .docx or .pdf with selectable text.`
    );
  }

  // Plaintext fallback (.txt / .md) when buffer has no binary null bytes
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const isLikelyText =
    (ext === "txt" || ext === "md") && !buffer.subarray(0, 1024).includes(0);

  if (isLikelyText) {
    const normalizedText = normalizeDocumentText(buffer.toString("utf-8"));
    const charCount = normalizedText.length;
    const wordCount = countWords(normalizedText);
    const extractedHyperlinks = extractAndCleanUrls(normalizedText);

    if (charCount < 80) {
      return makeFailedResult(
        "txt",
        "plaintext",
        "ERR_TEXT_TOO_SHORT",
        `Plaintext file "${filename}" contains only ${charCount} characters.`
      );
    }

    return {
      fileType: "txt",
      status: "success",
      parserUsed: "plaintext",
      normalizedText,
      rawHtmlPreview: null,
      charCount,
      wordCount,
      pageOrParagraphCount: normalizedText.split("\n").filter(Boolean).length,
      hadTablesOrTextBoxes: false,
      extractedHyperlinks,
      diagnostics: [],
    };
  }

  return makeFailedResult(
    "unknown",
    "magic-byte-router",
    "ERR_UNSUPPORTED_FILE_FORMAT",
    `Unrecognized file signature for "${filename}". Supported formats are .pdf, .docx, and .txt.`
  );
}

