import fs from "node:fs/promises";
import path from "node:path";
import { JOB_PROFILES, ZOHO_FOLDER_URL } from "@/lib/job-descriptions";
import { processResumeBuffer } from "@/lib/pipeline";
import {
  ProcessedDatasetSchema,
  type CandidateRecord,
  type ProcessedDataset,
} from "@/lib/schemas";
import { assignRoleRanks } from "@/lib/scoring";
import type { ZohoManifestEntry } from "./fetch-zoho-resumes";

async function loadEnvLocalIfPresent() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  try {
    const raw = await fs.readFile(envPath, "utf-8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (key && !(key in process.env)) {
        process.env[key] = val;
      }
    }
  } catch {
    // .env.local optional
  }
}

async function main() {
  await loadEnvLocalIfPresent();

  const resumesDir = path.resolve(process.cwd(), "public/resumes");
  const dataDir = path.resolve(process.cwd(), "data");
  const manifestPath = path.join(dataDir, "zoho-manifest.json");

  let manifest: ZohoManifestEntry[] = [];
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
  } catch {
    console.warn("zoho-manifest.json not found; scanning public/resumes/ directory.");
  }

  const manifestByFilename = new Map(manifest.map((m) => [m.filename, m]));
  const files = (await fs.readdir(resumesDir))
    .filter((f) => /\.(docx|pdf|txt)$/i.test(f))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    throw new Error("No resume files found in public/resumes/. Run npm run fetch-resumes first.");
  }

  console.log(
    `Ingesting ${files.length} resume(s) (Gemini key configured: ${Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)})...`
  );

  const rawCandidates: CandidateRecord[] = [];
  let index = 0;
  for (const filename of files) {
    index++;
    const filePath = path.join(resumesDir, filename);
    const meta = manifestByFilename.get(filename);

    console.log(`[START] Parsing ${filename} (${index}/${files.length})...`);
    try {
      const buffer = await fs.readFile(filePath);
      const record = await processResumeBuffer({
        buffer,
        filename,
        origin: "zoho_corpus",
        zohoResourceId: meta?.id ?? null,
        zohoFileUrl: meta?.permalink ?? null,
        localDownloadUrl: `/resumes/${encodeURIComponent(filename)}`,
      });

      rawCandidates.push(record);
      console.log(
        `[SUCCESS] ${filename} -> ${record.evaluation.classification} | JD1=${record.evaluation.jd1.totalScore} | JD2=${record.evaluation.jd2.totalScore} | parse=${record.parsing.status} | chars=${record.parsing.charCount} | exp(LCA=${record.extracted.experience.lcaYears}y, UIUX=${record.extracted.experience.uiuxYears}y)`
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[ERROR] Unhandled failure on ${filename}: ${errMsg}`);
    }
  }

  const rankedCandidates = assignRoleRanks(rawCandidates);

  const summaryCounts = {
    lca_stronger: rankedCandidates.filter(
      (c) => c.evaluation.classification === "lca_stronger"
    ).length,
    uiux_stronger: rankedCandidates.filter(
      (c) => c.evaluation.classification === "uiux_stronger"
    ).length,
    both: rankedCandidates.filter((c) => c.evaluation.classification === "both")
      .length,
    neither_uncertain: rankedCandidates.filter(
      (c) => c.evaluation.classification === "neither_uncertain"
    ).length,
    parseSuccess: rankedCandidates.filter((c) => c.parsing.status === "success")
      .length,
    parsePartial: rankedCandidates.filter((c) => c.parsing.status === "partial")
      .length,
    parseFailed: rankedCandidates.filter((c) => c.parsing.status === "failed")
      .length,
  };

  const dataset: ProcessedDataset = ProcessedDatasetSchema.parse({
    generatedAtIso: new Date().toISOString(),
    totalResumes: rankedCandidates.length,
    zohoFolderUrl: ZOHO_FOLDER_URL,
    jobProfiles: JOB_PROFILES,
    summaryCounts,
    candidates: rankedCandidates,
  });

  const outPath = path.join(dataDir, "processed-resumes.json");
  await fs.writeFile(outPath, JSON.stringify(dataset, null, 2), "utf-8");

  console.log("\n=== Ingestion Summary ===");
  console.log(JSON.stringify(summaryCounts, null, 2));
  console.log(`Saved canonical dataset to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

