const URL_REGEX = /https?:\/\/[^\s<>"')\]\}]+/gi;

/**
 * Normalizes raw extracted document text: strips control characters, repairs
 * hyphenated line breaks, standardizes bullet markers, and collapses excessive whitespace.
 */
export function normalizeDocumentText(raw: string): string {
  if (!raw) return "";

  let text = raw
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // Common private-use Wingdings/Symbol bullet characters from Word/PDF exports
    .replace(/[\uf0b7\uf0a7\uf0d8\uf0fc\u2022\u25aa\u25cf\u25cb\u2023\u2043]/g, "- ")
    // Join hyphenated words broken across lines (e.g., "life-\ncycle" -> "lifecycle")
    .replace(/([A-Za-z]{2,})-\n([A-Za-z]{2,})/g, "$1$2")
    // Remove control characters except tab and newline
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ");

  const lines = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    // Remove standalone page-number footers like "Page 1 of 2" or "- 1 -"
    .filter((line) => !/^(?:page\s+\d+(?:\s+of\s+\d+)?|-\s*\d+\s*-)$/i.test(line));

  text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return text;
}

/**
 * Extracts and cleans unique HTTP/HTTPS URLs from raw text and hyperlink lists.
 */
export function extractAndCleanUrls(
  text: string,
  extraLinks: string[] = []
): string[] {
  const candidates = [...(text.match(URL_REGEX) ?? []), ...extraLinks];
  const seen = new Set<string>();
  const valid: string[] = [];

  for (const rawUrl of candidates) {
    const cleaned = rawUrl.trim().replace(/[.,;:!?)]+$/, "");
    if (!/^https?:\/\//i.test(cleaned)) continue;
    try {
      const parsed = new URL(cleaned);
      const normalized = parsed.toString();
      const dedupKey = normalized.toLowerCase();
      if (!seen.has(dedupKey)) {
        seen.add(dedupKey);
        valid.push(normalized);
      }
    } catch {
      // Ignore malformed URL fragments
    }
  }

  return valid;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

