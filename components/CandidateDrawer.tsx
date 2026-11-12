"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  GraduationCap,
  Link as LinkIcon,
  ShieldAlert,
  Sparkles,
  Wrench,
  X,
  Briefcase,
  FolderGit2,
} from "lucide-react";
import type { CandidateRecord, RoleMatchEvaluation } from "@/lib/schemas";
import {
  CLASSIFICATION_META,
  PARSE_STATUS_META,
  getScoreBarColor,
  getScoreTextColor,
} from "@/lib/ui-helpers";

interface CandidateDrawerProps {
  candidate: CandidateRecord | null;
  totalCount: number;
  uploadedObjectUrls: Record<string, string>;
  onClose: () => void;
}

function RoleBreakdownCard({
  title,
  accent,
  evalData,
  totalCount,
}: {
  title: string;
  accent: "emerald" | "indigo";
  evalData: RoleMatchEvaluation;
  totalCount: number;
}) {
  const ring =
    accent === "emerald"
      ? "border-emerald-200 bg-emerald-50/40"
      : "border-indigo-200 bg-indigo-50/40";
  const bar = accent === "emerald" ? "bg-emerald-600" : "bg-indigo-600";

  // Max points lookup from rubric
  const maxMap: Record<string, number> =
    evalData.roleId === "jd1_lca"
      ? {
          "LCA Software": 18,
          "LCI/LCA Core Skills": 17,
          "Verified LCA Experience": 25,
          "LCA Projects": 20,
          "ISO Standards": 10,
          "Education & Preferred Fit": 10,
        }
      : {
          "Figma & Design Tools": 30,
          "UX Research & Psychology": 25,
          "Portfolio & Projects": 25,
          "Intern Experience Fit": 10,
          "Domain & Collaboration": 10,
        };

  return (
    <div className={`rounded-xl border p-4 ${ring}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {title}
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold ${getScoreTextColor(evalData.totalScore)}`}
            >
              {evalData.totalScore}
            </span>
            <span className="text-xs text-slate-500">/ 100 pts</span>
          </div>
        </div>
        <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-xs ring-1 ring-slate-200">
          Rank #{evalData.rankInRole ?? "-"} of {totalCount}
        </span>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-slate-600">
        {evalData.explanationSummary}
      </p>

      <div className="mt-3 space-y-2">
        {Object.entries(evalData.breakdown).map(([label, pts]) => {
          const maxPts = maxMap[label] ?? 25;
          const pct = Math.min(100, Math.round((pts / maxPts) * 100));
          return (
            <div key={label}>
              <div className="flex justify-between text-[11px] font-medium text-slate-700">
                <span>{label}</span>
                <span>
                  {pts} / {maxPts}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/80 ring-1 ring-slate-200/70">
                <div
                  className={`h-full rounded-full ${bar}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {evalData.evidenceCitations.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-slate-200/70 pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Verbatim Evidence Citations
          </p>
          {evalData.evidenceCitations.map((cit, idx) => (
            <div
              key={`${cit.criterion}-${idx}`}
              className="rounded-lg bg-white p-2.5 text-xs ring-1 ring-slate-200/80"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-800">
                  {cit.criterion}
                </span>
                <span className="text-[11px] font-medium text-slate-500">
                  +{cit.pointsAwarded}/{cit.maxPoints} ({cit.sourceSection})
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {cit.matchedItems.map((item, i) => (
                  <span
                    key={i}
                    className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700"
                  >
                    {item}
                  </span>
                ))}
              </div>
              {cit.evidenceSnippet && (
                <p className="mt-1.5 border-l-2 border-slate-300 pl-2 text-[11px] italic text-slate-500">
                  &ldquo;{cit.evidenceSnippet}&rdquo;
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {evalData.missingRequirements.length > 0 && (
        <div className="mt-3 border-t border-slate-200/70 pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-700">
            Missing / Gaps
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-600">
            {evalData.missingRequirements.map((gap, idx) => (
              <li key={idx}>{gap}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function CandidateDrawer({
  candidate,
  totalCount,
  uploadedObjectUrls,
  onClose,
}: CandidateDrawerProps) {
  const [previewTab, setPreviewTab] = useState<"structured" | "source">(
    "structured"
  );

  if (!candidate) return null;

  const clsMeta = CLASSIFICATION_META[candidate.evaluation.classification];
  const parseMeta = PARSE_STATUS_META[candidate.parsing.status];
  const downloadHref =
    candidate.source.localDownloadUrl ??
    uploadedObjectUrls[candidate.id] ??
    null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/45 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <aside
        className="flex h-full w-full max-w-4xl flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-bold text-slate-900">
                {candidate.displayName}
              </h2>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${clsMeta.badgeClass}`}
              >
                {clsMeta.label}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${parseMeta.badgeClass}`}
              >
                {parseMeta.label}
              </span>
              {candidate.source.origin === "user_upload" && (
                <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700 ring-1 ring-violet-600/20">
                  Live Test Upload
                </span>
              )}
            </div>
            <p className="mt-1 truncate text-xs text-slate-500">
              Source file:{" "}
              <span className="font-mono text-slate-700">
                {candidate.source.filename}
              </span>{" "}
              · {(candidate.source.fileSizeBytes / 1024).toFixed(1)} KB · Parser:{" "}
              <span className="font-mono">{candidate.parsing.parserUsed}</span>{" "}
              · Extraction:{" "}
              <span className="font-mono">
                {candidate.parsing.extractionMode}
              </span>
            </p>
            <p className="mt-1.5 text-xs font-medium text-slate-700">
              {candidate.evaluation.classificationReason}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close detail drawer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Source Action Bar + View Switch */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-6 py-2.5">
          <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-0.5">
            <button
              type="button"
              onClick={() => setPreviewTab("structured")}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                previewTab === "structured"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Score Breakdown & Extracted Data
            </button>
            <button
              type="button"
              onClick={() => setPreviewTab("source")}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                previewTab === "source"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Original File Preview ({candidate.parsing.charCount} chars)
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {downloadHref && (
              <a
                href={downloadHref}
                download={candidate.source.filename}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
              >
                <Download className="h-3.5 w-3.5" />
                Download Original (.{candidate.source.fileType})
              </a>
            )}
            {candidate.source.zohoFileUrl && (
              <a
                href={candidate.source.zohoFileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Zoho WorkDrive File
              </a>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {/* Diagnostics / Errors Banner */}
          {candidate.diagnostics.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-900">
                <ShieldAlert className="h-4 w-4 text-amber-700" />
                Pipeline Diagnostics & Extraction Errors (
                {candidate.diagnostics.length})
              </div>
              <div className="mt-2 space-y-1.5">
                {candidate.diagnostics.map((diag, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
                      diag.severity === "error"
                        ? "bg-rose-50 text-rose-900 ring-1 ring-rose-200"
                        : diag.severity === "warning"
                          ? "bg-amber-100/70 text-amber-950"
                          : "bg-white/80 text-slate-700"
                    }`}
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <div>
                      <span className="font-mono text-[11px] font-bold">
                        [{diag.stage} · {diag.code}]
                      </span>{" "}
                      {diag.message}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {previewTab === "source" ? (
            <div className="space-y-4">
              {candidate.parsing.rawHtmlPreview ? (
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Formatted DOCX HTML Render (via mammoth)
                    </span>
                    <span className="text-xs text-slate-400">
                      {candidate.parsing.wordCount} words
                    </span>
                  </div>
                  <div
                    className="docx-preview text-sm text-slate-700"
                    dangerouslySetInnerHTML={{
                      __html: candidate.parsing.rawHtmlPreview,
                    }}
                  />
                </div>
              ) : null}

              <div className="rounded-xl border border-slate-200 bg-slate-950 p-4 text-slate-100">
                <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold uppercase tracking-wider">
                    Normalized Extracted Plaintext
                  </span>
                  <span>{candidate.parsing.charCount} chars</span>
                </div>
                <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-200">
                  {candidate.parsing.rawTextExcerpt ||
                    "[No extractable text available — see diagnostics above]"}
                </pre>
              </div>
            </div>
          ) : (
            <>
              {/* Dual Role Score Breakdown */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <RoleBreakdownCard
                  title="JD1: LCA Consultant"
                  accent="emerald"
                  evalData={candidate.evaluation.jd1}
                  totalCount={totalCount}
                />
                <RoleBreakdownCard
                  title="JD2: UI/UX Design Intern"
                  accent="indigo"
                  evalData={candidate.evaluation.jd2}
                  totalCount={totalCount}
                />
              </div>

              {/* Standardized Skills */}
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                  <Wrench className="h-4 w-4 text-slate-500" />
                  Standardized & Verified Skills (
                  {candidate.extracted.skills.length})
                </div>
                {candidate.extracted.skills.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    No matching domain skills verified in source text.
                  </p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {candidate.extracted.skills.map((skill) => (
                      <span
                        key={skill.canonicalName}
                        title={
                          skill.evidenceSnippet ??
                          `Matched: ${skill.rawAliasesMatched.join(", ")}`
                        }
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                          skill.category.startsWith("lca") ||
                          skill.category === "sustainability_domain"
                            ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600/20"
                            : skill.category.startsWith("uiux")
                              ? "bg-indigo-50 text-indigo-800 ring-1 ring-indigo-600/20"
                              : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        <CheckCircle2 className="h-3 w-3 opacity-75" />
                        {skill.canonicalName}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Experience & Projects */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                      <Briefcase className="h-4 w-4 text-slate-500" />
                      Verified Experience (
                      {candidate.extracted.experiences.length})
                    </div>
                    <span className="text-[11px] font-medium text-slate-500">
                      LCA: {candidate.extracted.experience.lcaYears}y · UIUX:{" "}
                      {candidate.extracted.experience.uiuxYears}y · Total:{" "}
                      {candidate.extracted.experience.totalYears}y
                    </span>
                  </div>
                  <div className="mt-3 space-y-2.5">
                    {candidate.extracted.experiences.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        No structured date-bounded roles extracted.
                      </p>
                    ) : (
                      candidate.extracted.experiences.map((exp, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg bg-slate-50 p-2.5 text-xs ring-1 ring-slate-200/70"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-semibold text-slate-900">
                              {exp.title ?? "Role"}
                            </span>
                            <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600 ring-1 ring-slate-200">
                              {exp.domain.replace("_", " ")}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {exp.organization ? `${exp.organization} · ` : ""}
                            {exp.startDateRaw ?? "?"} – {exp.endDateRaw ?? "?"}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                      <FolderGit2 className="h-4 w-4 text-slate-500" />
                      Projects ({candidate.extracted.projects.length})
                    </div>
                    <span className="text-[11px] font-medium text-slate-500">
                      LCA: {candidate.extracted.lcaProjectCount} · UIUX:{" "}
                      {candidate.extracted.uiuxProjectCount}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2.5">
                    {candidate.extracted.projects.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        No separate project entries extracted.
                      </p>
                    ) : (
                      candidate.extracted.projects.map((proj, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg bg-slate-50 p-2.5 text-xs ring-1 ring-slate-200/70"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-semibold text-slate-900">
                              {proj.title ?? "Project"}
                            </span>
                            <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600 ring-1 ring-slate-200">
                              {proj.domain}
                            </span>
                          </div>
                          {proj.description && (
                            <p className="mt-1 line-clamp-2 text-[11px] text-slate-600">
                              {proj.description}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Education & Portfolio Links */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                    <GraduationCap className="h-4 w-4 text-slate-500" />
                    Education ({candidate.extracted.education.length})
                  </div>
                  <div className="mt-2.5 space-y-2">
                    {candidate.extracted.education.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        No degree entries detected.
                      </p>
                    ) : (
                      candidate.extracted.education.map((edu, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg bg-slate-50 p-2 text-xs text-slate-700"
                        >
                          <span className="font-semibold text-slate-900">
                            {edu.degreeRaw ?? edu.normalizedLevel}
                          </span>
                          {edu.fieldOfStudy ? ` — ${edu.fieldOfStudy}` : ""}
                          {edu.graduationYear ? ` (${edu.graduationYear})` : ""}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                    <LinkIcon className="h-4 w-4 text-slate-500" />
                    Extracted Hyperlinks & Portfolios (
                    {candidate.extracted.portfolioLinks.length})
                  </div>
                  <div className="mt-2.5 space-y-1.5">
                    {candidate.extracted.portfolioLinks.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        No external URLs or portfolio annotations found.
                      </p>
                    ) : (
                      candidate.extracted.portfolioLinks.map((url) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 truncate text-xs font-medium text-indigo-700 hover:underline"
                        >
                          <ExternalLink className="h-3 w-3 shrink-0" />
                          <span className="truncate">{url}</span>
                        </a>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Cleaning Audit Log */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                    <Sparkles className="h-4 w-4 text-sky-600" />
                    Deterministic Cleaning Audit Log (
                    {candidate.cleaningAuditLog.length})
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Date method:{" "}
                    <span className="font-mono">
                      {candidate.extracted.experience.calculationMethod}
                    </span>
                  </span>
                </div>
                {candidate.cleaningAuditLog.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    No post-extraction corrections, alias rewrites, or
                    discrepancy flags required for this profile.
                  </p>
                ) : (
                  <ul className="mt-2.5 space-y-1 text-xs text-slate-700">
                    {candidate.cleaningAuditLog.map((entry, idx) => (
                      <li
                        key={idx}
                        className="rounded bg-white px-2.5 py-1.5 font-mono text-[11px] ring-1 ring-slate-200/80"
                      >
                        {entry}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Quick Score Meter */}
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                  <FileText className="h-4 w-4 text-slate-500" />
                  Comparative Alignment Meter
                </div>
                <div className="mt-3 space-y-2.5">
                  <div>
                    <div className="flex justify-between text-xs font-medium">
                      <span>JD1: LCA Consultant</span>
                      <span>{candidate.evaluation.jd1.totalScore} / 100</span>
                    </div>
                    <div className="mt-1 h-2 w-full rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${getScoreBarColor(candidate.evaluation.jd1.totalScore)}`}
                        style={{
                          width: `${candidate.evaluation.jd1.totalScore}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-medium">
                      <span>JD2: UI/UX Design Intern</span>
                      <span>{candidate.evaluation.jd2.totalScore} / 100</span>
                    </div>
                    <div className="mt-1 h-2 w-full rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${getScoreBarColor(candidate.evaluation.jd2.totalScore)}`}
                        style={{
                          width: `${candidate.evaluation.jd2.totalScore}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

