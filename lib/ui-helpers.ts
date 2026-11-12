import type { ClassificationCategory, ParseStatus } from "./schemas";

export const CLASSIFICATION_META: Record<
  ClassificationCategory,
  {
    label: string;
    shortLabel: string;
    badgeClass: string;
    borderClass: string;
  }
> = {
  lca_stronger: {
    label: "Stronger Match: LCA Role",
    shortLabel: "LCA Stronger",
    badgeClass: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600/20",
    borderClass: "border-l-emerald-500",
  },
  uiux_stronger: {
    label: "Stronger Match: UI/UX Intern",
    shortLabel: "UI/UX Stronger",
    badgeClass: "bg-indigo-50 text-indigo-800 ring-1 ring-indigo-600/20",
    borderClass: "border-l-indigo-500",
  },
  both: {
    label: "Match: Both Roles",
    shortLabel: "Both Roles",
    badgeClass: "bg-amber-50 text-amber-800 ring-1 ring-amber-600/25",
    borderClass: "border-l-amber-500",
  },
  neither_uncertain: {
    label: "Neither / Uncertain",
    shortLabel: "Neither / Uncertain",
    badgeClass: "bg-slate-100 text-slate-700 ring-1 ring-slate-500/20",
    borderClass: "border-l-slate-400",
  },
};

export const PARSE_STATUS_META: Record<
  ParseStatus,
  { label: string; badgeClass: string }
> = {
  success: {
    label: "Parsed",
    badgeClass: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20",
  },
  partial: {
    label: "Partial Parse",
    badgeClass: "bg-amber-50 text-amber-800 ring-1 ring-amber-600/25",
  },
  failed: {
    label: "Parse Failed",
    badgeClass: "bg-rose-50 text-rose-700 ring-1 ring-rose-600/25",
  },
};

export function getScoreBarColor(score: number): string {
  if (score >= 70) return "bg-emerald-600";
  if (score >= 45) return "bg-sky-600";
  if (score >= 25) return "bg-amber-500";
  return "bg-slate-300";
}

export function getScoreTextColor(score: number): string {
  if (score >= 70) return "text-emerald-700";
  if (score >= 45) return "text-sky-700";
  if (score >= 25) return "text-amber-700";
  return "text-slate-500";
}

