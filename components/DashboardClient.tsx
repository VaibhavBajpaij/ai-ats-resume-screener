"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  Award,
  ExternalLink,
  FileSpreadsheet,
  Filter,
  FolderOpen,
  Layers,
  Palette,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import type {
  CandidateRecord,
  ClassificationCategory,
  ParseStatus,
  ProcessedDataset,
} from "@/lib/schemas";
import { assignRoleRanks } from "@/lib/scoring";
import {
  CLASSIFICATION_META,
  PARSE_STATUS_META,
  getScoreBarColor,
  getScoreTextColor,
} from "@/lib/ui-helpers";
import { CandidateDrawer } from "./CandidateDrawer";
import { MethodologyPanel } from "./MethodologyPanel";
import { UploadModal } from "./UploadModal";

type ActiveTab = "lca" | "uiux" | "matrix" | "errors";
type SortField =
  | "score"
  | "relevant_years"
  | "total_years"
  | "projects"
  | "name";

const STORAGE_KEY = "gfi_uploaded_candidates_v1";

export function DashboardClient({ dataset }: { dataset: ProcessedDataset }) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("lca");
  const [uploadedCandidates, setUploadedCandidates] = useState<
    CandidateRecord[]
  >([]);
  const [uploadedObjectUrls, setUploadedObjectUrls] = useState<
    Record<string, string>
  >({});
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null
  );
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  // Filters & Sorting
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<
    "all" | ClassificationCategory
  >("all");
  const [parseFilter, setParseFilter] = useState<"all" | ParseStatus>("all");
  const [minScore, setMinScore] = useState<number>(0);
  const [expFilter, setExpFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortField>("score");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  // Restore uploaded test resumes across refreshes in browser localStorage
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as CandidateRecord[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setUploadedCandidates(parsed);
        }
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const allRankedCandidates = useMemo(() => {
    const merged = [...dataset.candidates, ...uploadedCandidates];
    return assignRoleRanks(merged);
  }, [dataset.candidates, uploadedCandidates]);

  const counts = useMemo(() => {
    return {
      total: allRankedCandidates.length,
      lca_stronger: allRankedCandidates.filter(
        (c) => c.evaluation.classification === "lca_stronger"
      ).length,
      uiux_stronger: allRankedCandidates.filter(
        (c) => c.evaluation.classification === "uiux_stronger"
      ).length,
      both: allRankedCandidates.filter(
        (c) => c.evaluation.classification === "both"
      ).length,
      neither_uncertain: allRankedCandidates.filter(
        (c) => c.evaluation.classification === "neither_uncertain"
      ).length,
      issues: allRankedCandidates.filter(
        (c) =>
          c.parsing.status !== "success" ||
          c.diagnostics.some((d) => d.severity === "error")
      ).length,
    };
  }, [allRankedCandidates]);

  const selectedCandidate = useMemo(
    () =>
      allRankedCandidates.find((c) => c.id === selectedCandidateId) ?? null,
    [allRankedCandidates, selectedCandidateId]
  );

  const handleCandidateAnalyzed = (
    newCandidate: CandidateRecord,
    objectUrl: string
  ) => {
    const nextUploads = [...uploadedCandidates, newCandidate];
    setUploadedCandidates(nextUploads);
    setUploadedObjectUrls((prev) => ({
      ...prev,
      [newCandidate.id]: objectUrl,
    }));
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUploads));
    } catch {
      // Ignore quota exceeded
    }

    // Switch to most relevant tab & open drawer immediately
    if (newCandidate.parsing.status === "failed") {
      setActiveTab("errors");
    } else if (newCandidate.evaluation.classification === "uiux_stronger") {
      setActiveTab("uiux");
    } else if (newCandidate.evaluation.classification === "lca_stronger") {
      setActiveTab("lca");
    } else {
      setActiveTab("matrix");
    }
    setSelectedCandidateId(newCandidate.id);
  };

  const handleClearUploads = () => {
    setUploadedCandidates([]);
    setUploadedObjectUrls({});
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
  };

  const filteredAndSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = allRankedCandidates.filter((c) => {
      if (categoryFilter !== "all" && c.evaluation.classification !== categoryFilter) {
        return false;
      }
      if (parseFilter !== "all" && c.parsing.status !== parseFilter) {
        return false;
      }

      const activeScore =
        activeTab === "uiux"
          ? c.evaluation.jd2.totalScore
          : activeTab === "lca"
            ? c.evaluation.jd1.totalScore
            : Math.max(
                c.evaluation.jd1.totalScore,
                c.evaluation.jd2.totalScore
              );
      if (activeScore < minScore) return false;

      const relYears =
        activeTab === "uiux"
          ? c.extracted.experience.uiuxYears
          : activeTab === "lca"
            ? c.extracted.experience.lcaYears
            : Math.max(
                c.extracted.experience.lcaYears,
                c.extracted.experience.uiuxYears
              );

      if (expFilter === "intern_0_1_5" && relYears > 1.5) return false;
      if (expFilter === "lca_2_6" && (relYears < 2 || relYears > 6))
        return false;
      if (expFilter === "has_exp" && relYears <= 0) return false;
      if (expFilter === "zero_exp" && relYears > 0) return false;

      if (q) {
        const haystack = [
          c.displayName,
          c.source.filename,
          c.extracted.skills.map((s) => s.canonicalName).join(" "),
          c.extracted.projects.map((p) => p.title ?? "").join(" "),
          c.parsing.rawTextExcerpt.slice(0, 2000),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });

    const dir = sortDir === "desc" ? -1 : 1;

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "score") {
        const sA =
          activeTab === "uiux"
            ? a.evaluation.jd2.totalScore
            : activeTab === "lca"
              ? a.evaluation.jd1.totalScore
              : Math.max(
                  a.evaluation.jd1.totalScore,
                  a.evaluation.jd2.totalScore
                );
        const sB =
          activeTab === "uiux"
            ? b.evaluation.jd2.totalScore
            : activeTab === "lca"
              ? b.evaluation.jd1.totalScore
              : Math.max(
                  b.evaluation.jd1.totalScore,
                  b.evaluation.jd2.totalScore
                );
        cmp = sA - sB;
      } else if (sortBy === "relevant_years") {
        const yA =
          activeTab === "uiux"
            ? a.extracted.experience.uiuxYears
            : activeTab === "lca"
              ? a.extracted.experience.lcaYears
              : Math.max(
                  a.extracted.experience.lcaYears,
                  a.extracted.experience.uiuxYears
                );
        const yB =
          activeTab === "uiux"
            ? b.extracted.experience.uiuxYears
            : activeTab === "lca"
              ? b.extracted.experience.lcaYears
              : Math.max(
                  b.extracted.experience.lcaYears,
                  b.extracted.experience.uiuxYears
                );
        cmp = yA - yB;
      } else if (sortBy === "total_years") {
        cmp =
          a.extracted.experience.totalYears - b.extracted.experience.totalYears;
      } else if (sortBy === "projects") {
        const pA =
          activeTab === "uiux"
            ? a.extracted.uiuxProjectCount
            : activeTab === "lca"
              ? a.extracted.lcaProjectCount
              : a.extracted.lcaProjectCount + a.extracted.uiuxProjectCount;
        const pB =
          activeTab === "uiux"
            ? b.extracted.uiuxProjectCount
            : activeTab === "lca"
              ? b.extracted.lcaProjectCount
              : b.extracted.lcaProjectCount + b.extracted.uiuxProjectCount;
        cmp = pA - pB;
      } else {
        cmp = a.displayName.localeCompare(b.displayName);
      }

      if (cmp !== 0) return cmp * dir;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [
    allRankedCandidates,
    searchQuery,
    categoryFilter,
    parseFilter,
    minScore,
    expFilter,
    sortBy,
    sortDir,
    activeTab,
  ]);

  const activeProfile =
    activeTab === "uiux" ? dataset.jobProfiles.jd2 : dataset.jobProfiles.jd1;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-xs">
              <Sparkles className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                Growth For Impact · Resume Screener & Ranker
              </h1>
              <p className="text-xs text-slate-500">
                Grounded Extraction · Deterministic Sanitization · Dual-Role ATS
                Scoring ({dataset.totalResumes} corpus +{" "}
                {uploadedCandidates.length} uploaded)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={dataset.zohoFolderUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
            >
              <FolderOpen className="h-3.5 w-3.5 text-slate-500" />
              Source Zoho Folder
              <ExternalLink className="h-3 w-3 text-slate-400" />
            </a>

            {uploadedCandidates.length > 0 && (
              <button
                type="button"
                onClick={handleClearUploads}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear Test Uploads ({uploadedCandidates.length})
              </button>
            )}

            <button
              type="button"
              onClick={() => setUploadModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              Upload Test Resume
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {/* KPI Summary Cards */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <button
            type="button"
            onClick={() => {
              setCategoryFilter("all");
              setParseFilter("all");
              setActiveTab("matrix");
            }}
            className="rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 hover:shadow-xs"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Total Candidates
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {counts.total}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              47 Zoho + {uploadedCandidates.length} uploaded
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              setCategoryFilter("lca_stronger");
              setActiveTab("lca");
            }}
            className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 text-left transition hover:border-emerald-300 hover:shadow-xs"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
              LCA Stronger
            </p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">
              {counts.lca_stronger}
            </p>
            <p className="mt-0.5 text-[11px] text-emerald-700/80">
              JD1 ≥ 45 &amp; leading
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              setCategoryFilter("uiux_stronger");
              setActiveTab("uiux");
            }}
            className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 text-left transition hover:border-indigo-300 hover:shadow-xs"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-800">
              UI/UX Stronger
            </p>
            <p className="mt-1 text-2xl font-bold text-indigo-700">
              {counts.uiux_stronger}
            </p>
            <p className="mt-0.5 text-[11px] text-indigo-700/80">
              JD2 ≥ 45 &amp; leading
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              setCategoryFilter("both");
              setActiveTab("matrix");
            }}
            className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 text-left transition hover:border-amber-300 hover:shadow-xs"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">
              Both Roles
            </p>
            <p className="mt-1 text-2xl font-bold text-amber-700">
              {counts.both}
            </p>
            <p className="mt-0.5 text-[11px] text-amber-700/80">
              Within 12-pt margin
            </p>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("errors")}
            className="col-span-2 rounded-xl border border-rose-200 bg-rose-50/40 p-4 text-left transition hover:border-rose-300 hover:shadow-xs sm:col-span-1"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-800">
              Neither / Parse Errors
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {counts.neither_uncertain}{" "}
              <span className="text-sm font-semibold text-rose-700">
                ({counts.issues} failed)
              </span>
            </p>
            <p className="mt-0.5 text-[11px] text-rose-700/80">
              Inspect error diagnostics
            </p>
          </button>
        </section>

        {/* 4-Tab Navigation */}
        <nav className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
          <button
            type="button"
            onClick={() => {
              setActiveTab("lca");
              setCategoryFilter("all");
              setSortBy("score");
              setSortDir("desc");
            }}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === "lca"
                ? "bg-emerald-700 text-white shadow-xs"
                : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            <Award className="h-4 w-4" />
            1. LCA Ranked (JD1)
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("uiux");
              setCategoryFilter("all");
              setSortBy("score");
              setSortDir("desc");
            }}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === "uiux"
                ? "bg-indigo-700 text-white shadow-xs"
                : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            <Palette className="h-4 w-4" />
            2. UI/UX Ranked (JD2)
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("matrix");
              setCategoryFilter("all");
            }}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === "matrix"
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            <Layers className="h-4 w-4" />
            3. Classification Matrix
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("errors")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === "errors"
                ? "bg-rose-700 text-white shadow-xs"
                : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            <AlertTriangle className="h-4 w-4" />
            4. Errors &amp; Methodology ({counts.issues} failed)
          </button>
        </nav>

        {activeTab === "errors" ? (
          <MethodologyPanel
            candidates={allRankedCandidates}
            jobProfiles={dataset.jobProfiles}
            onSelectCandidate={(c) => setSelectedCandidateId(c.id)}
          />
        ) : (
          <>
            {/* Active JD Context Banner */}
            {(activeTab === "lca" || activeTab === "uiux") && (
              <section
                className={`rounded-2xl border p-4 ${
                  activeTab === "lca"
                    ? "border-emerald-200 bg-emerald-50/50"
                    : "border-indigo-200 bg-indigo-50/50"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="max-w-3xl">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-slate-700" />
                      <h2 className="text-sm font-bold text-slate-900">
                        {activeProfile.title}
                      </h2>
                      <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
                        {activeProfile.experienceRequirementLabel}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-700">
                      {activeProfile.summary}
                    </p>
                  </div>
                  <a
                    href={activeProfile.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
                  >
                    Original JD Form
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </section>
            )}

            {/* Filter & Sort Controls */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
                <div className="relative lg:col-span-2">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search candidate, skill, tool, or project..."
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none"
                  />
                </div>

                <select
                  value={categoryFilter}
                  onChange={(e) =>
                    setCategoryFilter(
                      e.target.value as "all" | ClassificationCategory
                    )
                  }
                  aria-label="Filter by classification"
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 focus:border-slate-400 focus:bg-white focus:outline-none"
                >
                  <option value="all">All Classifications</option>
                  <option value="lca_stronger">LCA Stronger</option>
                  <option value="uiux_stronger">UI/UX Stronger</option>
                  <option value="both">Both Roles</option>
                  <option value="neither_uncertain">Neither / Uncertain</option>
                </select>

                <select
                  value={minScore}
                  onChange={(e) => setMinScore(Number(e.target.value))}
                  aria-label="Filter by minimum score"
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 focus:border-slate-400 focus:bg-white focus:outline-none"
                >
                  <option value={0}>Score: Any (0–100)</option>
                  <option value={45}>Qualified (≥ 45 pts)</option>
                  <option value={60}>Strong Match (≥ 60 pts)</option>
                  <option value={75}>Top Tier (≥ 75 pts)</option>
                </select>

                <select
                  value={expFilter}
                  onChange={(e) => setExpFilter(e.target.value)}
                  aria-label="Filter by relevant experience"
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 focus:border-slate-400 focus:bg-white focus:outline-none"
                >
                  <option value="all">Relevant Exp: Any</option>
                  <option value="lca_2_6">2–6 yrs (LCA Target)</option>
                  <option value="intern_0_1_5">0–1.5 yrs (Intern Band)</option>
                  <option value="has_exp">&gt; 0 yrs Relevant Exp</option>
                  <option value="zero_exp">0 yrs / Unspecified</option>
                </select>

                <div className="flex items-center gap-1.5">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortField)}
                    aria-label="Sort candidates by"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-medium text-slate-800 focus:border-slate-400 focus:bg-white focus:outline-none"
                  >
                    <option value="score">Sort: Match Score</option>
                    <option value="relevant_years">Sort: Relevant Yrs</option>
                    <option value="total_years">Sort: Total Yrs</option>
                    <option value="projects">Sort: Projects</option>
                    <option value="name">Sort: Candidate ID</option>
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      setSortDir((prev) => (prev === "desc" ? "asc" : "desc"))
                    }
                    title={`Sort direction: ${sortDir.toUpperCase()}`}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-700 hover:bg-slate-100"
                  >
                    <ArrowUpDown className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <Filter className="h-3.5 w-3.5" />
                  <span>
                    Showing{" "}
                    <strong className="text-slate-900">
                      {filteredAndSorted.length}
                    </strong>{" "}
                    of {allRankedCandidates.length} candidates
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span>Parse Status:</span>
                  {(["all", "success", "partial", "failed"] as const).map(
                    (st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setParseFilter(st)}
                        className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition ${
                          parseFilter === st
                            ? "bg-slate-900 text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {st === "all" ? "All" : st}
                      </button>
                    )
                  )}
                </div>
              </div>
            </section>

            {/* Candidate Table */}
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Rank</th>
                      <th className="px-4 py-3">Candidate</th>
                      <th className="px-4 py-3">Classification</th>
                      {activeTab === "matrix" ? (
                        <>
                          <th className="px-4 py-3">JD1 (LCA)</th>
                          <th className="px-4 py-3">JD2 (UI/UX)</th>
                        </>
                      ) : (
                        <th className="px-4 py-3">
                          {activeTab === "uiux" ? "JD2 Score" : "JD1 Score"}
                        </th>
                      )}
                      <th className="px-4 py-3">Relevant Exp</th>
                      <th className="px-4 py-3">Matched Skills & Evidence</th>
                      <th className="px-4 py-3 text-right">Inspect</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredAndSorted.length === 0 ? (
                      <tr>
                        <td
                          colSpan={activeTab === "matrix" ? 8 : 7}
                          className="px-6 py-10 text-center text-sm text-slate-500"
                        >
                          No candidates match the current filters.
                        </td>
                      </tr>
                    ) : (
                      filteredAndSorted.map((c) => {
                        const clsMeta =
                          CLASSIFICATION_META[c.evaluation.classification];
                        const parseMeta = PARSE_STATUS_META[c.parsing.status];
                        const roleEval =
                          activeTab === "uiux"
                            ? c.evaluation.jd2
                            : c.evaluation.jd1;
                        const relYears =
                          activeTab === "uiux"
                            ? c.extracted.experience.uiuxYears
                            : activeTab === "lca"
                              ? c.extracted.experience.lcaYears
                              : Math.max(
                                  c.extracted.experience.lcaYears,
                                  c.extracted.experience.uiuxYears
                                );
                        const relProjects =
                          activeTab === "uiux"
                            ? c.extracted.uiuxProjectCount
                            : activeTab === "lca"
                              ? c.extracted.lcaProjectCount
                              : c.extracted.lcaProjectCount +
                                c.extracted.uiuxProjectCount;

                        return (
                          <tr
                            key={c.id}
                            onClick={() => setSelectedCandidateId(c.id)}
                            className={`cursor-pointer border-l-4 transition hover:bg-slate-50 ${clsMeta.borderClass}`}
                          >
                            <td className="whitespace-nowrap px-4 py-3.5 font-bold text-slate-700">
                              {activeTab === "matrix" ? (
                                <div className="space-y-0.5 text-[11px]">
                                  <div>LCA #{c.evaluation.jd1.rankInRole}</div>
                                  <div>UX #{c.evaluation.jd2.rankInRole}</div>
                                </div>
                              ) : (
                                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-800">
                                  #{roleEval.rankInRole}
                                </span>
                              )}
                            </td>

                            <td className="px-4 py-3.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-bold text-slate-900">
                                  {c.displayName}
                                </span>
                                {c.source.origin === "user_upload" && (
                                  <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-800">
                                    UPLOADED
                                  </span>
                                )}
                                {c.parsing.status !== "success" && (
                                  <span
                                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${parseMeta.badgeClass}`}
                                  >
                                    {parseMeta.label}
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 max-w-[190px] truncate font-mono text-[11px] text-slate-400">
                                {c.source.filename}
                              </p>
                            </td>

                            <td className="whitespace-nowrap px-4 py-3.5">
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${clsMeta.badgeClass}`}
                              >
                                {clsMeta.shortLabel}
                              </span>
                            </td>

                            {activeTab === "matrix" ? (
                              <>
                                <td className="whitespace-nowrap px-4 py-3.5">
                                  <span
                                    className={`text-sm font-bold ${getScoreTextColor(c.evaluation.jd1.totalScore)}`}
                                  >
                                    {c.evaluation.jd1.totalScore}
                                  </span>
                                  <span className="text-[11px] text-slate-400">
                                    {" "}
                                    (#{c.evaluation.jd1.rankInRole})
                                  </span>
                                </td>
                                <td className="whitespace-nowrap px-4 py-3.5">
                                  <span
                                    className={`text-sm font-bold ${getScoreTextColor(c.evaluation.jd2.totalScore)}`}
                                  >
                                    {c.evaluation.jd2.totalScore}
                                  </span>
                                  <span className="text-[11px] text-slate-400">
                                    {" "}
                                    (#{c.evaluation.jd2.rankInRole})
                                  </span>
                                </td>
                              </>
                            ) : (
                              <td className="w-36 px-4 py-3.5">
                                <div className="flex items-baseline justify-between">
                                  <span
                                    className={`text-sm font-bold ${getScoreTextColor(roleEval.totalScore)}`}
                                  >
                                    {roleEval.totalScore}
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    / 100
                                  </span>
                                </div>
                                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                  <div
                                    className={`h-full rounded-full ${getScoreBarColor(roleEval.totalScore)}`}
                                    style={{ width: `${roleEval.totalScore}%` }}
                                  />
                                </div>
                              </td>
                            )}

                            <td className="whitespace-nowrap px-4 py-3.5 text-slate-700">
                              <div className="font-semibold">
                                {relYears} yrs{" "}
                                <span className="font-normal text-slate-400">
                                  (tot {c.extracted.experience.totalYears}y)
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {relProjects} project(s)
                              </div>
                            </td>

                            <td className="max-w-md px-4 py-3.5">
                              {c.parsing.status === "failed" ? (
                                <p className="text-xs font-medium text-rose-700">
                                  {c.diagnostics[0]?.code ?? "ERR_PARSE_FAILED"}
                                  :{" "}
                                  {c.diagnostics[0]?.message ??
                                    "Parsing failed"}
                                </p>
                              ) : (
                                <>
                                  <div className="flex flex-wrap gap-1">
                                    {c.extracted.skills
                                      .slice(0, 5)
                                      .map((sk) => (
                                        <span
                                          key={sk.canonicalName}
                                          className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700"
                                        >
                                          {sk.canonicalName}
                                        </span>
                                      ))}
                                    {c.extracted.skills.length > 5 && (
                                      <span className="text-[11px] text-slate-400">
                                        +{c.extracted.skills.length - 5}
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-1 line-clamp-1 text-[11px] text-slate-500">
                                    {activeTab === "matrix"
                                      ? c.evaluation.classificationReason
                                      : roleEval.explanationSummary}
                                  </p>
                                </>
                              )}
                            </td>

                            <td className="whitespace-nowrap px-4 py-3.5 text-right">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedCandidateId(c.id);
                                }}
                                className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-200"
                              >
                                Details
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>

      <CandidateDrawer
        candidate={selectedCandidate}
        totalCount={allRankedCandidates.length}
        uploadedObjectUrls={uploadedObjectUrls}
        onClose={() => setSelectedCandidateId(null)}
      />

      <UploadModal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onCandidateAnalyzed={handleCandidateAnalyzed}
      />
    </div>
  );
}

