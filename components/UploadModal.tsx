"use client";

import React, { useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileUp,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";
import type { CandidateRecord } from "@/lib/schemas";

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onCandidateAnalyzed: (
    candidate: CandidateRecord,
    objectUrl: string
  ) => void;
}

export function UploadModal({
  open,
  onClose,
  onCandidateAnalyzed,
}: UploadModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!open) return null;

  const handleFileSelect = (file: File | undefined) => {
    if (!file) return;
    setErrorMsg(null);
    if (file.size > 4.5 * 1024 * 1024) {
      setErrorMsg(
        `File "${file.name}" (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the 4.5 MB Vercel upload limit.`
      );
      return;
    }
    setSelectedFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setIsUploading(true);
    setErrorMsg(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Upload failed with HTTP ${res.status}`);
      }

      const objectUrl = URL.createObjectURL(selectedFile);
      onCandidateAnalyzed(data.candidate as CandidateRecord, objectUrl);
      setSelectedFile(null);
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Failed to analyze uploaded resume."
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px]"
      onClick={() => !isUploading && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Upload & Dynamically Rank Test Resume
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Supports <span className="font-semibold">.pdf</span> and{" "}
              <span className="font-semibold">.docx</span> up to 4.5 MB. Runs
              through the identical parser, cleaner, and JD1/JD2 ranking engine
              and merges live into the 47-candidate pile.
            </p>
          </div>
          <button
            type="button"
            disabled={isUploading}
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              handleFileSelect(e.dataTransfer.files?.[0]);
            }}
            onClick={() => inputRef.current?.click()}
            className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition ${
              isDragging
                ? "border-emerald-500 bg-emerald-50/50"
                : "border-slate-300 bg-slate-50/70 hover:border-slate-400 hover:bg-slate-50"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,.doc"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files?.[0])}
            />
            {selectedFile ? (
              <div className="flex flex-col items-center gap-2">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                <p className="text-sm font-semibold text-slate-900">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-slate-500">
                  {(selectedFile.size / 1024).toFixed(1)} KB · Click to replace
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <UploadCloud className="h-9 w-9 text-slate-400" />
                <p className="text-sm font-semibold text-slate-700">
                  Drop a resume here or click to browse
                </p>
                <p className="text-xs text-slate-500">
                  PDF (multi-column & annotations) or DOCX (OOXML text boxes &
                  links)
                </p>
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-xs text-rose-800 ring-1 ring-rose-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {isUploading && (
            <div className="flex items-center gap-3 rounded-lg bg-sky-50 p-3 text-xs font-medium text-sky-900 ring-1 ring-sky-200">
              <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
              <span>
                Parsing document, running grounded extraction & deterministic
                cleaning, and computing JD1/JD2 rankings...
              </span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={isUploading}
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedFile || isUploading}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <FileUp className="h-3.5 w-3.5" />
                  Extract & Rank Resume
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

