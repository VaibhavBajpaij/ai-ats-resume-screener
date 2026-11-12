"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Cpu,
  FileWarning,
  Scale,
  Sparkles,
} from "lucide-react";
import type { CandidateRecord, JobProfile } from "@/lib/schemas";
import { PARSE_STATUS_META } from "@/lib/ui-helpers";

interface MethodologyPanelProps {
  candidates: CandidateRecord[];
  jobProfiles: { jd1: JobProfile; jd2: JobProfile };
  onSelectCandidate: (candidate: CandidateRecord) => void;
}

export function MethodologyPanel({
  candidates,
  jobProfiles,
  onSelectCandidate,
}: MethodologyPanelProps) {
  const [showCleaningAudits, setShowCleaningAudits] = useState(false);

  const failedResumes = candidates.filter((c) => c.parsing.status === "failed");
  const llmStructuredCount = candidates.filter(
    (c) => c.parsing.extractionMode === "llm_structured"
  ).length;
  const warningResumes = candidates.filter(
    (c) =>
      c.parsing.status !== "failed" &&
      c.diagnostics.some(
        (d) => d.severity === "error" || d.severity === "warning"
      )
  );

  const candidatesWithIssues = candidates
    .filter((c) => {
      const hasErrorOrWarn =
        c.parsing.status !== "success" ||
        c.diagnostics.some(
          (d) => d.severity === "error" || d.severity === "warning"
        );
      return showCleaningAudits
        ? hasErrorOrWarn || c.cleaningAuditLog.length > 0
        : hasErrorOrWarn;
    })
    .sort((a, b) => {
      const rank = { failed: 0, partial: 1, success: 2 } as const;
      return rank[a.parsing.status] - rank[b.parsing.status];
    });

  return (
    <div className="space-y-6">
      {/* Transparent Error & Diagnostics Section */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-700">
              <FileWarning className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Extraction Errors, Warnings &amp; Cleaning Diagnostics
              </h3>
              <p className="text-xs text-slate-500">
                Transparent audit of failed scrapes, fallback warnings, and
                post-AI data cleaning across {candidates.length} resumes.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700 ring-1 ring-rose-600/20">
              {failedResumes.length} Failed
            </span>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800 ring-1 ring-amber-600/20">
              {warningResumes.length} Warnings
            </span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 ring-1 ring-emerald-600/20">
              {llmStructuredCount} AI Extracted
            </span>
            <button
              type="button"
              onClick={() => setShowCleaningAudits((prev) => !prev)}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                showCleaningAudits
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {showCleaningAudits
                ? "Hide Routine Cleaning Audits"
                : "Include Routine Cleaning Audits"}
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {candidatesWithIssues.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-xs font-medium text-emerald-800">
              <CheckCircle2 className="h-4 w-4" />
              All resumes parsed and validated cleanly with zero diagnostics.
            </div>
          ) : (
            candidatesWithIssues.map((c) => {
              const parseMeta = PARSE_STATUS_META[c.parsing.status];
              return (
                <div
                  key={c.id}
                  className={`rounded-xl border p-4 transition hover:shadow-xs ${
                    c.parsing.status === "failed"
                      ? "border-rose-200 bg-rose-50/50"
                      : "border-slate-200 bg-slate-50/60"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">
                        {c.displayName}
                      </span>
                      <span className="font-mono text-xs text-slate-500">
                        {c.source.filename}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${parseMeta.badgeClass}`}
                      >
                        {parseMeta.label}
                      </span>
                      <span className="rounded bg-white px-2 py-0.5 font-mono text-[11px] text-slate-600 ring-1 ring-slate-200">
                        {c.parsing.charCount} chars · {c.parsing.extractionMode}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectCandidate(c)}
                      className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 ring-1 ring-slate-300 hover:bg-slate-100"
                    >
                      Inspect Candidate
                    </button>
                  </div>

                  <div className="mt-2.5 space-y-1.5">
                    {c.diagnostics
                      .filter(
                        (d) => d.severity === "error" || d.severity === "warning"
                      )
                      .map((d, i) => (
                        <div
                          key={i}
                          className={`flex items-start gap-2 rounded-lg px-3 py-1.5 text-xs ${
                            d.severity === "error"
                              ? "bg-rose-100/70 text-rose-900"
                              : "bg-amber-100/70 text-amber-950"
                          }`}
                        >
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>
                            <strong className="font-mono">[{d.code}]</strong>{" "}
                            {d.message}
                          </span>
                        </div>
                      ))}
                    {showCleaningAudits &&
                      c.cleaningAuditLog.map((log, i) => (
                        <div
                          key={`audit-${i}`}
                          className="rounded-lg bg-white px-3 py-1.5 font-mono text-[11px] text-slate-700 ring-1 ring-slate-200/70"
                        >
                          [CLEANER] {log}
                        </div>
                      ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Methodology Documentation */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Cpu className="h-4 w-4 text-sky-600" />
            1. Ingestion & Parsing Pipeline (DOCX + PDF)
          </div>
          <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-600">
            <li>
              <strong>Magic-Byte Routing:</strong> Incoming buffers are routed
              by file signature (<code>%PDF-</code> vs <code>PK\x03\x04</code>{" "}
              OOXML), rejecting legacy binary <code>.doc</code>, empty buffers,
              or files &gt;4.5 MB gracefully.
            </li>
            <li>
              <strong>DOCX Deep Extraction:</strong> Combines{" "}
              <code>mammoth</code> (base text + sanitized HTML preview) with a
              supplementary <code>jszip</code> OOXML parser scanning{" "}
              <code>word/document.xml</code> text boxes (
              <code>&lt;w:txbxContent&gt;</code>), headers/footers, and{" "}
              <code>word/_rels/*.rels</code> to recover hidden Figma/Behance
              links.
            </li>
            <li>
              <strong>Multi-Column PDF Parsing:</strong> Uses{" "}
              <code>pdf-parse</code> with a custom X/Y coordinate{" "}
              <code>pagerender</code> callback (<code>|Δy| &lt;= 3pt</code>) +{" "}
              <code>pdfjs-dist</code> annotation traversal for hidden{" "}
              <code>/URI</code> portfolio links, plus scanned-PDF detection
              (&lt;50 chars/page).
            </li>
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Sparkles className="h-4 w-4 text-amber-600" />
            2. Grounded Extraction & Deterministic Cleaning
          </div>
          <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-600">
            <li>
              <strong>Structured Extraction:</strong> Validates every extraction
              against strict Zod schemas (<code>RawLLMExtractionSchema</code>{" "}
              via Gemini Flash (<code>gemini-3.5-flash-lite</code>) when configured, or deterministic heuristic
              fallback when offline/unconfigured).
            </li>
            <li>
              <strong>Hallucination Guard:</strong> <code>lib/cleaner.ts</code>{" "}
              verifies every extracted skill against the normalized source text
              and strips uncorroborated claims into{" "}
              <code>cleaningAuditLog</code>.
            </li>
            <li>
              <strong>Taxonomy & Date Math:</strong> Standardizes aliases (e.g.,{" "}
              <code>gabi ts → GaBi</code>, <code>figjam → Figma</code>,{" "}
              <code>iso14040 → ISO 14040</code>) and merges overlapping role
              date intervals per domain so concurrent roles never double-count
              years.
            </li>
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-2">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Scale className="h-4 w-4 text-emerald-600" />
            3. Explicit 100-Point Scoring & 4-Category Classification Rules
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl bg-emerald-50/50 p-4 ring-1 ring-emerald-200">
              <p className="text-xs font-bold text-emerald-900">
                {jobProfiles.jd1.shortTitle} (100 pts)
              </p>
              <p className="mt-1 text-[11px] text-emerald-800">
                Experience band: {jobProfiles.jd1.experienceRequirementLabel}
              </p>
              <ul className="mt-2 space-y-1 text-xs text-slate-700">
                {Object.entries(jobProfiles.jd1.scoringWeights).map(
                  ([k, v]) => (
                    <li key={k} className="flex justify-between">
                      <span>{k}</span>
                      <span className="font-semibold">{v} pts</span>
                    </li>
                  )
                )}
              </ul>
            </div>

            <div className="rounded-xl bg-indigo-50/50 p-4 ring-1 ring-indigo-200">
              <p className="text-xs font-bold text-indigo-900">
                {jobProfiles.jd2.shortTitle} (100 pts)
              </p>
              <p className="mt-1 text-[11px] text-indigo-800">
                Experience band: {jobProfiles.jd2.experienceRequirementLabel}
              </p>
              <ul className="mt-2 space-y-1 text-xs text-slate-700">
                {Object.entries(jobProfiles.jd2.scoringWeights).map(
                  ([k, v]) => (
                    <li key={k} className="flex justify-between">
                      <span>{k}</span>
                      <span className="font-semibold">{v} pts</span>
                    </li>
                  )
                )}
              </ul>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 p-3.5 text-xs text-slate-700 ring-1 ring-slate-200">
            <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
            <div>
              <strong>Classification Matrix Thresholds:</strong>{" "}
              <code>neither_uncertain</code> if document parsing failed or both
              scores &lt; 45; <code>both</code> if both &ge; 45 and |JD1 − JD2|
              &lt; 12 (or both &ge; 58); <code>lca_stronger</code> if JD1 &ge; 45
              and leads by &ge; 12 pts (or JD2 &lt; 45);{" "}
              <code>uiux_stronger</code> otherwise.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

