import type { DiagnosticIssue, ParsedDocumentResult } from "@/lib/schemas";
import {
  countWords,
  extractAndCleanUrls,
  normalizeDocumentText,
} from "./text-normalizer";

interface PdfTextItem {
  str: string;
  transform: number[];
  width?: number;
  hasEOL?: boolean;
}

interface PdfAnnotation {
  subtype?: string;
  url?: string;
  unsafeUrl?: string;
}

interface PdfPageProxyLike {
  getTextContent: (opts?: {
    normalizeWhitespace?: boolean;
    disableCombineTextItems?: boolean;
  }) => Promise<{ items: PdfTextItem[] }>;
  getAnnotations?: () => Promise<PdfAnnotation[]>;
}

/**
 * Groups PDF text items by Y coordinate (|Δy| <= 3pt) and sorts left-to-right,
 * inserting clear column/table separators when large horizontal gaps exist.
 */
export function renderPageItemsByCoordinates(items: PdfTextItem[]): string {
  const positioned = items
    .filter((item) => item.str && item.str.trim().length > 0 && Array.isArray(item.transform))
    .map((item) => ({
      str: item.str,
      x: item.transform[4] ?? 0,
      y: item.transform[5] ?? 0,
      width: item.width ?? 0,
    }));

  if (positioned.length === 0) return "";

  // PDF Y coordinates run bottom-to-top, so sort descending by Y then ascending by X
  positioned.sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: Array<{ y: number; items: typeof positioned }> = [];
  for (const item of positioned) {
    const existingLine = lines.find((line) => Math.abs(line.y - item.y) <= 3);
    if (existingLine) {
      existingLine.items.push(item);
    } else {
      lines.push({ y: item.y, items: [item] });
    }
  }

  const renderedLines: string[] = [];
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    let lineText = "";
    let prevEndX: number | null = null;

    for (const token of line.items) {
      if (prevEndX !== null) {
        const gap = token.x - prevEndX;
        if (gap > 28) {
          lineText += " | ";
        } else if (gap > 1.5 && !lineText.endsWith(" ")) {
          lineText += " ";
        }
      }
      lineText += token.str;
      prevEndX = token.x + token.width;
    }

    const cleanedLine = lineText.replace(/\s+/g, " ").trim();
    if (cleanedLine) {
      renderedLines.push(cleanedLine);
    }
  }

  return renderedLines.join("\n");
}

async function extractPdfJsLinksAndFallbackText(
  buffer: Buffer
): Promise<{ links: string[]; fallbackText: string; pageCount: number }> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      disableFontFace: true,
      verbosity: 0,
    });
    const doc = await loadingTask.promise;
    const links: string[] = [];
    const pagesText: string[] = [];

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      try {
        const annotations = await page.getAnnotations();
        for (const annot of annotations as PdfAnnotation[]) {
          if (annot.url) links.push(annot.url);
          if (annot.unsafeUrl) links.push(annot.unsafeUrl);
        }
      } catch {
        // Ignore annotation extraction failure on individual pages
      }

      try {
        const textContent = await page.getTextContent();
        pagesText.push(
          renderPageItemsByCoordinates(textContent.items as PdfTextItem[])
        );
      } catch {
        // Ignore fallback text extraction failure on individual pages
      }
    }

    return {
      links,
      fallbackText: pagesText.filter(Boolean).join("\n\n"),
      pageCount: doc.numPages,
    };
  } catch {
    return { links: [], fallbackText: "", pageCount: 0 };
  }
}

/**
 * Parses a .pdf buffer using pdf-parse (via lib/pdf-parse.js to bypass debug-mode file read)
 * with custom Y-coordinate line grouping + pdfjs-dist /URI annotation extraction.
 */
export async function parsePdfBuffer(
  buffer: Buffer
): Promise<ParsedDocumentResult> {
  const diagnostics: DiagnosticIssue[] = [];
  const collectedLinks: string[] = [];
  let rawText = "";
  let numPages = 0;
  let parserUsed = "pdf-parse+pdfjs";

  try {
    const pdfParseModule = await import("pdf-parse/lib/pdf-parse.js");
    const pdfParse = pdfParseModule.default ?? pdfParseModule;

    const result = await pdfParse(buffer, {
      pagerender: async (pageData: unknown) => {
        const page = pageData as PdfPageProxyLike;
        if (typeof page.getAnnotations === "function") {
          try {
            const annots = await page.getAnnotations();
            for (const annot of annots) {
              if (annot.url) collectedLinks.push(annot.url);
              if (annot.unsafeUrl) collectedLinks.push(annot.unsafeUrl);
            }
          } catch {
            // Supplementary pdfjs-dist pass below also collects annotations
          }
        }
        const textContent = await page.getTextContent({
          normalizeWhitespace: false,
          disableCombineTextItems: false,
        });
        return renderPageItemsByCoordinates(textContent.items ?? []);
      },
    });

    rawText = result.text ?? "";
    numPages = result.numpages ?? 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown PDF error";
    if (/password|encrypted/i.test(message)) {
      diagnostics.push({
        stage: "parsing",
        severity: "error",
        code: "ERR_PDF_ENCRYPTED",
        message:
          "PDF is password-protected or encrypted and cannot be parsed automatically.",
      });
      return {
        fileType: "pdf",
        status: "failed",
        parserUsed: "pdf-parse",
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

    diagnostics.push({
      stage: "parsing",
      severity: "warning",
      code: "WARN_PDF_PARSE_FALLBACK_TO_PDFJS",
      message: `Primary pdf-parse failed (${message}); attempting pdfjs-dist fallback.`,
    });
    parserUsed = "pdfjs-dist-fallback";
  }

  // Always run supplementary pdfjs-dist annotation extraction (and fallback text if needed)
  const pdfJsData = await extractPdfJsLinksAndFallbackText(buffer);
  collectedLinks.push(...pdfJsData.links);
  if (!rawText.trim() && pdfJsData.fallbackText.trim()) {
    rawText = pdfJsData.fallbackText;
  }
  if (numPages === 0 && pdfJsData.pageCount > 0) {
    numPages = pdfJsData.pageCount;
  }

  const normalizedText = normalizeDocumentText(rawText);
  const extractedHyperlinks = extractAndCleanUrls(
    normalizedText,
    collectedLinks
  );
  const charCount = normalizedText.length;
  const wordCount = countWords(normalizedText);

  // Detect CID glyph encoding failures (e.g., "(cid:123)") common in broken PDF font maps
  const cidMatches = normalizedText.match(/\(cid:\d+\)/g) ?? [];
  const cidRatio = charCount > 0 ? (cidMatches.length * 8) / charCount : 0;
  const charsPerPage = charCount / Math.max(1, numPages || 1);
  const hadTablesOrTextBoxes = normalizedText.includes(" | ");

  let status: ParsedDocumentResult["status"] = "success";

  if (charCount < 120 || charsPerPage < 50) {
    status = "failed";
    diagnostics.push({
      stage: "parsing",
      severity: "error",
      code: "ERR_PDF_SCANNED_OR_IMAGE_ONLY",
      message: `Only ${charCount} extractable character(s) across ${Math.max(1, numPages)} page(s) (${Math.round(charsPerPage)} chars/page). PDF appears to be a scanned image or outlined vector export without a selectable text layer.`,
    });
  } else if (cidRatio > 0.15) {
    status = "partial";
    diagnostics.push({
      stage: "parsing",
      severity: "warning",
      code: "WARN_PDF_CORRUPT_FONT_ENCODING",
      message: `Detected ${cidMatches.length} unreadable (cid:...) glyph tokens due to broken embedded font mappings; extraction quality may be degraded.`,
    });
  } else if (charCount < 350) {
    status = "partial";
    diagnostics.push({
      stage: "parsing",
      severity: "warning",
      code: "WARN_PDF_SPARSE_TEXT",
      message: `Extracted only ${charCount} characters (${wordCount} words); some sections may be rasterized images.`,
    });
  }

  if (collectedLinks.length > 0) {
    diagnostics.push({
      stage: "parsing",
      severity: "info",
      code: "INFO_PDF_URI_ANNOTATIONS_EXTRACTED",
      message: `Extracted ${extractedHyperlinks.length} unique URL(s) including embedded PDF /URI link annotations.`,
    });
  }

  return {
    fileType: "pdf",
    status,
    parserUsed,
    normalizedText,
    rawHtmlPreview: null,
    charCount,
    wordCount,
    pageOrParagraphCount: Math.max(1, numPages),
    hadTablesOrTextBoxes,
    extractedHyperlinks,
    diagnostics,
  };
}

