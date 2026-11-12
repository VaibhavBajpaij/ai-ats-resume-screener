# AI ATS Resume Screener & Deterministic Candidate Ranking Engine

[![Next.js 15](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/) [![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org/) [![Gemini Flash](https://img.shields.io/badge/Google%20Gemini-Flash%20Latest-4285F4?logo=google)](https://ai.google.dev/) [![Zod](https://img.shields.io/badge/Validated%20with-Zod-3E67B1)](https://zod.dev/) [![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

An AI-powered **Applicant Tracking System (ATS)**, **Resume Parser**, and **Multi-Role Candidate Ranking Engine** built with **Next.js 15 (App Router)** and **TypeScript**.

Most AI resume screeners fail in production because standard parsers drop text from multi-column Canva/Figma templates, and LLMs hallucinate skills or double-count overlapping job dates. This engine solves both problems through a **deep OOXML/PDF coordinate parser**, **strictly grounded LLM extraction**, and a **deterministic post-AI verification and scoring pipeline**.

---

## Core Engineering Highlights

### 1. Two-Tier Shared Pipeline Architecture
Running 47+ remote file downloads and LLM extractions inside a single serverless HTTP request causes immediate cold-start timeouts on cloud tiers. This project separates batch ingestion from live testing while sharing 100% of the core engine (`lib/pipeline.ts`):
* **Tier 1 (Offline Batch Ingestion):** Ingests, parses, cleans, and scores the 47-resume corpus ahead of deployment into a reproducible JSON artifact (`data/processed-resumes.json`) with preserved source file references.
* **Tier 2 (Live Stateless Upload API):** A `POST /api/analyze` endpoint on Vercel that accepts new `.pdf` or `.docx` resumes at runtime, executes the exact same parsing and ranking pipeline, and dynamically inserts the candidate into the live cohort.

### 2. Deep DOCX & Coordinate-Aware PDF Parsing (`lib/parsers/`)
* **Magic-Byte Format Routing:** Inspects file buffer signatures (`%PDF-` vs `PK\x03\x04`) rather than trusting file extensions, rejecting legacy binary `.doc` files, empty files, `.txt` files, or oversized payloads (>4.5 MB) with structured diagnostic codes.
* **Dual-Layer DOCX Extraction (`mammoth` + `jszip`):** Standard `mammoth` extraction routinely drops Word text boxes (`<w:txbxContent>`), headers/footers, and hyperlink relationships used in modern resume templates. A custom OOXML inspector parses `word/document.xml`, `word/header*.xml`, `word/footer*.xml`, and `word/_rels/*.rels` directly to recover text boxes and embedded portfolio URLs (Figma, Behance, Dribbble, GitHub).
* **Multi-Column PDF Parsing (`pdf-parse` + `pdfjs-dist`):** Uses X/Y transform coordinate grouping (`|Δy| <= 3pt`) to prevent two-column designer resumes from scrambling across lines, while extracting hidden `/URI` link annotations. Detects image-only/scanned exports (`ERR_PDF_SCANNED_OR_IMAGE_ONLY` / `ERR_DOCX_IMAGE_ONLY`) and routes them safely without crashing.

### 3. Anti-Hallucination & Deterministic Data Cleaning (`lib/cleaner.ts`)
To prevent unverified AI outputs from corrupting candidate rankings, every extraction passes through a deterministic sanitizer before scoring:
* **Verbatim Evidence Grounding:** Every extracted skill, role, and project requires a verbatim snippet from the source resume.
* **Source-Text Verification:** Every LLM-emitted skill is cross-checked against the normalized resume text and hyperlink table. Unverified claims are stripped and recorded in a per-candidate `cleaningAuditLog`.
* **Canonical Taxonomy Normalization (`lib/taxonomy.ts`):** Maps noisy aliases to canonical names (e.g., `gabi ts` / `sphera gabi` -> `GaBi`, `simapro 9` -> `SimaPro`, `iso-14040` -> `ISO 14040`, `figjam` -> `Figma`).
* **Interval-Merged Experience Math:** Parses raw start/end dates and merges overlapping date intervals per domain so concurrent internships or freelance roles never double-count total years of experience.

### 4. Auditable Multi-Role Scoring & 4-Way Classification (`lib/scoring.ts`)
Every candidate is evaluated deterministically out of **100 points** against two distinct target profiles:

| Role Profile | Weighted Rubric Breakdown (100 Points Total) |
| :--- | :--- |
| **JD1: LifeCycle Assessment (LCA) Consultant** | **LCA Software** (`GaBi`, `SimaPro`, `OpenLCA`): **18 pts** <br> **Core LCI/LCA Domain Skills**: **17 pts** <br> **Verified LCA Experience Years** (Peak 2–6 yrs): **25 pts** <br> **Verified LCA Project Count** (>=3 projects): **20 pts** <br> **ISO Standards & Compliance** (`ISO 14040/14044`, `EPD`): **10 pts** <br> **Relevant Environmental Degree & Fit**: **10 pts** |
| **JD2: UI/UX Design Internship** | **Figma & Prototyping Tools**: **30 pts** <br> **UX Research, Usability & Psychology**: **25 pts** <br> **Portfolio Links & UI/UX Project Evidence**: **25 pts** <br> **Internship Experience Band** (0–1.5 yrs): **10 pts** <br> **Sustainability Interest & Collaboration**: **10 pts** |

* **Classification Thresholds:** Candidates are classified into `lca_stronger`, `uiux_stronger`, `both`, or `neither_uncertain` using a **45-point minimum qualification threshold**, a **58-point dual-match threshold**, and a **12-point dominance margin**.

---

## Corpus Processing Summary (47 Anonymized Resumes)
* **Total Processed:** 47 `.docx` resumes
* **Successful Extractions:** 46 / 47
* **Graceful Parse Failures:** 1 / 47 (`anonymized_resume_1793685080327.docx` — verified 0-character empty/image-only document, flagged with `ERR_DOCX_IMAGE_ONLY`, scored `0`, classified `neither_uncertain`)
* **Role Distribution:**
  * **Stronger Match — LCA Role (JD1):** 12 candidates
  * **Stronger Match — UI/UX Internship (JD2):** 24 candidates
  * **Strong Match for Both:** 0 candidates
  * **Neither / Uncertain:** 11 candidates

---

## Tech Stack
* **Framework:** Next.js 15 (App Router), React 19, TypeScript
* **Document Parsing:** `pdf-parse`, `pdfjs-dist`, `mammoth`, `jszip`
* **AI & Validation:** `@google/genai` (`gemini-flash-latest` via `v1beta` with deterministic `heuristic_fallback`), `zod`
* **Styling & UI:** Tailwind CSS, `lucide-react`
* **Testing:** Vitest (`16/16` unit & route tests covering parsers, interval math, hallucination stripping, and API guards)

---

## Local Setup & Commands

```bash
# 1. Install dependencies
npm install

# 2. (Optional) Configure Gemini API key in .env.local
# Without a key, the pipeline runs cleanly in deterministic heuristic_fallback mode
cp .env.example .env.local

# 3. Run unit tests, typecheck, and linter
npm test
npm run typecheck
npm run lint

# 4. Re-run offline batch ingestion on the 47 resumes
npm run ingest

# 5. Start local development server
npm run dev
```

## Author
**Vaibhav Bajpai**
Lead Software Engineer @ [CBDev Studio](https://cbdevstudio.in)
GitHub: [@VaibhavBajpaij](https://github.com/VaibhavBajpaij)
LinkedIn: [vaibhav-bajpai18](https://www.linkedin.com/in/vaibhav-bajpai18/)
