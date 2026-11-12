import fs from "node:fs/promises";
import path from "node:path";

const FOLDER_ID = "nyche10b5dccdb33743dfa46604e3aa2a2e2b";
const FOLDER_PAGE_URL = `https://workdrive.zohoexternal.in/folder/${FOLDER_ID}`;
const API_URL = `https://workdrive.zohoexternal.in/public/api/v1/files/${FOLDER_ID}/files?sort=name&page%5Blimit%5D=100`;

export interface ZohoManifestEntry {
  id: string;
  filename: string;
  downloadUrl: string;
  permalink: string;
  sizeBytes: number;
}

function extractCookies(headers: Headers): string {
  const setCookies =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [];
  return setCookies
    .map((c) => c.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

function extractCsrfFromCookie(cookieHeader: string): string | null {
  const match = cookieHeader.match(/zwd_csrf_cookie=([^;]+)/i) ?? cookieHeader.match(/zpcr=([^;]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
}

async function fetchZohoManifestAndFiles() {
  const resumesDir = path.resolve(process.cwd(), "public/resumes");
  const dataDir = path.resolve(process.cwd(), "data");
  await fs.mkdir(resumesDir, { recursive: true });
  await fs.mkdir(dataDir, { recursive: true });

  // 1. Prime session cookies from folder page
  const pageRes = await fetch(FOLDER_PAGE_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    },
  });
  const cookieHeader = extractCookies(pageRes.headers);
  const csrfToken = extractCsrfFromCookie(cookieHeader);

  const apiHeaders: Record<string, string> = {
    Accept: "application/vnd.api+json",
    Referer: FOLDER_PAGE_URL,
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  };
  if (cookieHeader) apiHeaders["Cookie"] = cookieHeader;
  if (csrfToken) apiHeaders["x-zcsrf-token"] = `zpcr=${csrfToken}`;

  const listRes = await fetch(API_URL, { headers: apiHeaders });
  if (!listRes.ok) {
    throw new Error(
      `Zoho API listing failed with HTTP ${listRes.status}: ${await listRes.text()}`
    );
  }

  const json = (await listRes.json()) as {
    data?: Array<{
      id: string;
      attributes?: {
        name?: string;
        download_url?: string;
        permalink?: string;
        storage_info?: { size_in_bytes?: number };
      };
    }>;
  };

  const items = json.data ?? [];
  if (items.length === 0) {
    throw new Error("Zoho API returned 0 files.");
  }

  console.log(`Found ${items.length} file(s) in Zoho WorkDrive folder.`);

  const manifest: ZohoManifestEntry[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const filename = item.attributes?.name ?? `${item.id}.docx`;
    const downloadUrl =
      item.attributes?.download_url ??
      `https://files-accl.zohoexternal.in/public/workdrive-external/download/${item.id}`;
    const permalink =
      item.attributes?.permalink ??
      `https://workdrive.zohoexternal.in/file/${item.id}`;
    const sizeBytes = item.attributes?.storage_info?.size_in_bytes ?? 0;

    manifest.push({
      id: item.id,
      filename,
      downloadUrl,
      permalink,
      sizeBytes,
    });

    const outPath = path.join(resumesDir, filename);
    // Download file if missing or size 0
    let needsDownload = true;
    try {
      const stat = await fs.stat(outPath);
      if (stat.size > 0) needsDownload = false;
    } catch {
      needsDownload = true;
    }

    if (needsDownload) {
      const dlRes = await fetch(downloadUrl, {
        headers: {
          Referer: FOLDER_PAGE_URL,
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
          "User-Agent": apiHeaders["User-Agent"],
        },
        redirect: "follow",
      });
      if (!dlRes.ok) {
        throw new Error(
          `Failed to download ${filename} (${downloadUrl}): HTTP ${dlRes.status}`
        );
      }
      const arrayBuffer = await dlRes.arrayBuffer();
      const buf = Buffer.from(arrayBuffer);
      await fs.writeFile(outPath, buf);
      console.log(`[${i + 1}/${items.length}] Downloaded ${filename} (${buf.length} bytes)`);
    } else {
      console.log(`[${i + 1}/${items.length}] Cached ${filename}`);
    }
  }

  const manifestPath = path.join(dataDir, "zoho-manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  console.log(`Saved manifest for ${manifest.length} files to ${manifestPath}`);
}

fetchZohoManifestAndFiles().catch((err) => {
  console.error(err);
  process.exit(1);
});

