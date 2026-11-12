import { GoogleGenAI, Type } from "@google/genai";
import {
  RawLLMExtractionSchema,
  type DiagnosticIssue,
  type DomainTag,
  type ParsedDocumentResult,
  type RawEducationEntry,
  type RawExperienceEntry,
  type RawLLMExtraction,
  type RawProjectEntry,
  type RawSkillEntry,
} from "@/lib/schemas";
import { SKILL_TAXONOMY, aliasMatchesText } from "@/lib/taxonomy";

export const EXTRACTION_SYSTEM_PROMPT = `You are a deterministic HR resume extraction engine. Extract structured candidate data from an anonymized resume into the exact JSON schema provided.

STRICT GROUNDING RULES:
1. GROUNDING ONLY: Extract ONLY facts explicitly stated in the resume text or extracted hyperlinks. Never invent, extrapolate, or infer unstated tools, standards, projects, degrees, or years of experience.
2. VERBATIM EVIDENCE: For every skill, experience entry, and project, include a verbatim evidenceSnippet (<= 160 chars) copied directly from the source text.
3. DOMAIN CLASSIFICATION: Tag each experience and project strictly as:
   - "lca_sustainability" / "lca": Life Cycle Assessment, LCI, EPD, GaBi, SimaPro, OpenLCA, ISO 14040/14044, GHG accounting, carbon footprint, environmental sustainability consulting.
   - "uiux_design" / "uiux": UI/UX design, product design, wireframing, prototyping, Figma, user research, usability testing, design systems, web/app interface design.
   - "software_engineering": General coding/web development without primary UI/UX ownership.
   - "other": All other domains.
4. DATE INTEGRITY: Preserve exact startDateRaw and endDateRaw strings (e.g. "Jan 2022", "Present") for each role. Only populate *YearsReported if the resume text explicitly states a numeric duration summary; otherwise return null.
5. AMBIGUITY REPORTING: If dates are missing, text is fragmented/garbled, or sections are unreadable, record clear descriptions in uncertaintyFlags rather than guessing.
6. ANONYMITY: Use the provided candidate file ID as candidateLabel; do not fabricate names.`;

export function buildExtractionUserPrompt(
  filename: string,
  parsed: ParsedDocumentResult
): string {
  const truncatedText = parsed.normalizedText.slice(0, 18000);
  const truncationNote =
    parsed.normalizedText.length > 18000
      ? `\n[Note: Resume truncated from ${parsed.normalizedText.length} to 18000 chars]`
      : "";

  return `Target Job Context (for domain/keyword awareness only — never hallucinate missing skills):
- JD1 (LCA Consultant): GaBi, SimaPro, OpenLCA, ecoinvent, ISO 14040, ISO 14044, LCI data collection/validation, LCA modelling, EPD, public benchmarking, operational/logistics data, >=3 LCA projects, Environmental degree.
- JD2 (UI/UX Design Intern): Figma, prototyping, wireframing, user research, user psychology, usability testing, visual design, design systems, responsive website/job board UX, sustainability interest.

Candidate File ID: ${filename}
Extracted Hyperlinks: ${JSON.stringify(parsed.extractedHyperlinks)}
Normalized Resume Text:${truncationNote}
"""
${truncatedText}
"""`;
}

const GEMINI_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    candidateLabel: { type: Type.STRING, nullable: true },
    professionalSummary: { type: Type.STRING, nullable: true },
    totalExperienceYearsReported: { type: Type.NUMBER, nullable: true },
    lcaExperienceYearsReported: { type: Type.NUMBER, nullable: true },
    uiuxExperienceYearsReported: { type: Type.NUMBER, nullable: true },
    skills: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          rawName: { type: Type.STRING },
          domainHint: {
            type: Type.STRING,
            enum: [
              "lca_sustainability",
              "uiux_design",
              "software_engineering",
              "other",
            ],
          },
          evidenceSnippet: { type: Type.STRING },
        },
        required: ["rawName", "domainHint", "evidenceSnippet"],
      },
    },
    experiences: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, nullable: true },
          organization: { type: Type.STRING, nullable: true },
          startDateRaw: { type: Type.STRING, nullable: true },
          endDateRaw: { type: Type.STRING, nullable: true },
          durationMonthsReported: { type: Type.NUMBER, nullable: true },
          domain: {
            type: Type.STRING,
            enum: [
              "lca_sustainability",
              "uiux_design",
              "software_engineering",
              "other",
            ],
          },
          responsibilities: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          toolsUsed: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          evidenceSnippet: { type: Type.STRING },
        },
        required: [
          "title",
          "organization",
          "startDateRaw",
          "endDateRaw",
          "durationMonthsReported",
          "domain",
          "responsibilities",
          "toolsUsed",
          "evidenceSnippet",
        ],
      },
    },
    projects: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, nullable: true },
          domain: {
            type: Type.STRING,
            enum: ["lca", "uiux", "other"],
          },
          description: { type: Type.STRING },
          toolsOrStandardsUsed: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          evidenceSnippet: { type: Type.STRING },
        },
        required: [
          "title",
          "domain",
          "description",
          "toolsOrStandardsUsed",
          "evidenceSnippet",
        ],
      },
    },
    education: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          degreeRaw: { type: Type.STRING, nullable: true },
          fieldOfStudy: { type: Type.STRING, nullable: true },
          institution: { type: Type.STRING, nullable: true },
          graduationYear: { type: Type.STRING, nullable: true },
          isEnvironmentalDomain: { type: Type.BOOLEAN },
          isDesignDomain: { type: Type.BOOLEAN },
        },
        required: [
          "degreeRaw",
          "fieldOfStudy",
          "institution",
          "graduationYear",
          "isEnvironmentalDomain",
          "isDesignDomain",
        ],
      },
    },
    certificationsAndStandards: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    portfolioOrProfileUrls: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    roleKeywords: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    uncertaintyFlags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: [
    "candidateLabel",
    "professionalSummary",
    "totalExperienceYearsReported",
    "lcaExperienceYearsReported",
    "uiuxExperienceYearsReported",
    "skills",
    "experiences",
    "projects",
    "education",
    "certificationsAndStandards",
    "portfolioOrProfileUrls",
    "roleKeywords",
    "uncertaintyFlags",
  ],
};

function classifyLineDomain(text: string): DomainTag {
  const lower = text.toLowerCase();
  if (
    /\b(lca|life\s*cycle\s*assessment|lifecycle\s*assessment|lci|gabi|simapro|openlca|iso\s*14040|iso\s*14044|epd|sustainability|ghg|carbon\s*footprint)\b/i.test(
      lower
    )
  ) {
    return "lca_sustainability";
  }
  if (
    /\b(ui\/ux|ux\/ui|ui\s*ux|ux\s*design|ui\s*design|product\s*design|figma|wirefram|prototyp|user\s*research|usability|design\s*intern)\b/i.test(
      lower
    )
  ) {
    return "uiux_design";
  }
  if (
    /\b(software\s*engineer|developer|full\s*stack|frontend|backend|react|node\.js|python|java)\b/i.test(
      lower
    )
  ) {
    return "software_engineering";
  }
  return "other";
}

function splitSections(text: string): Record<string, string[]> {
  const sections: Record<string, string[]> = {
    header: [],
    summary: [],
    experience: [],
    projects: [],
    education: [],
    skills: [],
    certifications: [],
  };

  let current = "header";
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const cleanHeading = line.replace(/[:|\-–—]+$/g, "").trim().toLowerCase();
    const isShortHeading = cleanHeading.length <= 48 && line.split(" ").length <= 6;

    if (isShortHeading) {
      if (/^(summary|profile|objective|about\s*me|professional\s*summary)$/i.test(cleanHeading)) {
        current = "summary";
        continue;
      }
      if (/^(experience|work\s*experience|professional\s*experience|employment|work\s*history|internships?)$/i.test(cleanHeading)) {
        current = "experience";
        continue;
      }
      if (/^(projects?|academic\s*projects?|key\s*projects?|case\s*studies|selected\s*projects?)$/i.test(cleanHeading)) {
        current = "projects";
        continue;
      }
      if (/^(education|academic\s*background|qualifications?)$/i.test(cleanHeading)) {
        current = "education";
        continue;
      }
      if (/^(skills?|technical\s*skills?|tools?|core\s*competencies|expertise|software)$/i.test(cleanHeading)) {
        current = "skills";
        continue;
      }
      if (/^(certifications?|certificates?|standards?|achievements?|awards?)$/i.test(cleanHeading)) {
        current = "certifications";
        continue;
      }
    }

    sections[current].push(line);
  }

  return sections;
}

const DATE_RANGE_REGEX =
  /\b((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[\s,.'-]*(?:19|20)\d{2}|(?:0?[1-9]|1[0-2])\s*\/\s*(?:19|20)\d{2}|(?:19|20)\d{2})\s*(?:-|–|—|to)\s*(present|current|currently|ongoing|now|till\s*date|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[\s,.'-]*(?:19|20)\d{2}|(?:0?[1-9]|1[0-2])\s*\/\s*(?:19|20)\d{2}|(?:19|20)\d{2})\b/i;

/**
 * Deterministic Heuristic Fallback Extractor.
 * Used when GEMINI_API_KEY is absent or when an LLM API call fails.
 */
export function heuristicFallbackExtract(
  filename: string,
  parsed: ParsedDocumentResult
): RawLLMExtraction {
  const text = parsed.normalizedText;
  const sections = splitSections(text);
  const uncertaintyFlags: string[] = [];

  // 1. Skills via taxonomy scan with exact snippets
  const skills: RawSkillEntry[] = [];
  for (const entry of SKILL_TAXONOMY) {
    const matchedAlias = entry.aliases.find((alias) =>
      aliasMatchesText(text, alias)
    );
    if (!matchedAlias) continue;
    const idx = text.toLowerCase().indexOf(matchedAlias.toLowerCase());
    const snippet =
      idx >= 0
        ? text
            .slice(Math.max(0, idx - 35), Math.min(text.length, idx + 85))
            .replace(/\s+/g, " ")
            .trim()
        : matchedAlias;

    const domainHint: DomainTag =
      entry.category.startsWith("lca") || entry.category === "sustainability_domain"
        ? "lca_sustainability"
        : entry.category.startsWith("uiux")
          ? "uiux_design"
          : "other";

    skills.push({
      rawName: entry.canonicalName,
      domainHint,
      evidenceSnippet: snippet.slice(0, 160),
    });
  }

  // 2. Experiences from Experience section (or full text lines with date ranges)
  const expLines =
    sections.experience.length > 0 ? sections.experience : text.split("\n");
  const experiences: RawExperienceEntry[] = [];
  let currentExp: RawExperienceEntry | null = null;

  for (let i = 0; i < expLines.length; i++) {
    const line = expLines[i];
    const dateMatch = line.match(DATE_RANGE_REGEX);
    if (dateMatch && !/^-\s/.test(line)) {
      if (currentExp) experiences.push(currentExp);

      const titleCandidate =
        line.replace(dateMatch[0], "").replace(/[\|\-–—]+$/g, "").trim() ||
        (i > 0 && expLines[i - 1].length < 80 ? expLines[i - 1] : null);
      const matchedTools = SKILL_TAXONOMY.filter((t) =>
        t.aliases.some((a) => aliasMatchesText(line, a))
      ).map((t) => t.canonicalName);

      currentExp = {
        title: titleCandidate || "Experience Entry",
        organization: null,
        startDateRaw: dateMatch[1],
        endDateRaw: dateMatch[2],
        durationMonthsReported: null,
        domain: classifyLineDomain(line),
        responsibilities: [],
        toolsUsed: matchedTools,
        evidenceSnippet: line.slice(0, 160),
      };
    } else if (currentExp && currentExp.responsibilities.length < 6) {
      currentExp.responsibilities.push(line.replace(/^-\s*/, ""));
      const extraTools = SKILL_TAXONOMY.filter((t) =>
        t.aliases.some((a) => aliasMatchesText(line, a))
      ).map((t) => t.canonicalName);
      for (const tool of extraTools) {
        if (!currentExp.toolsUsed.includes(tool)) {
          currentExp.toolsUsed.push(tool);
        }
      }
      currentExp.domain = classifyLineDomain(
        `${currentExp.title ?? ""} ${currentExp.responsibilities.join(" ")} ${currentExp.toolsUsed.join(" ")}`
      );
    }
  }
  if (currentExp) experiences.push(currentExp);

  // 3. Projects from Projects section + experience bullets describing named projects
  const projects: RawProjectEntry[] = [];
  let activeProject: RawProjectEntry | null = null;
  for (const line of sections.projects) {
    const isBullet = /^[-*•]\s/.test(line);
    if (!isBullet && line.length <= 95) {
      if (activeProject) projects.push(activeProject);
      const d = classifyLineDomain(line);
      activeProject = {
        title: line.replace(/[:|\-–—]+$/g, "").trim(),
        domain:
          d === "lca_sustainability"
            ? "lca"
            : d === "uiux_design"
              ? "uiux"
              : "other",
        description: "",
        toolsOrStandardsUsed: [],
        evidenceSnippet: line.slice(0, 160),
      };
    } else if (activeProject) {
      activeProject.description = [activeProject.description, line.replace(/^-\s*/, "")]
        .filter(Boolean)
        .join(" ");
      const d = classifyLineDomain(
        `${activeProject.title ?? ""} ${activeProject.description}`
      );
      activeProject.domain =
        d === "lca_sustainability"
          ? "lca"
          : d === "uiux_design"
            ? "uiux"
            : "other";
      const tools = SKILL_TAXONOMY.filter((t) =>
        t.aliases.some((a) => aliasMatchesText(line, a))
      ).map((t) => t.canonicalName);
      for (const tool of tools) {
        if (!activeProject.toolsOrStandardsUsed.includes(tool)) {
          activeProject.toolsOrStandardsUsed.push(tool);
        }
      }
    } else {
      // Bullet list directly under Projects heading without subheaders
      const cleanDesc = line.replace(/^-\s*/, "");
      const d = classifyLineDomain(cleanDesc);
      projects.push({
        title: cleanDesc.slice(0, 65),
        domain:
          d === "lca_sustainability"
            ? "lca"
            : d === "uiux_design"
              ? "uiux"
              : "other",
        description: cleanDesc,
        toolsOrStandardsUsed: SKILL_TAXONOMY.filter((t) =>
          t.aliases.some((a) => aliasMatchesText(cleanDesc, a))
        ).map((t) => t.canonicalName),
        evidenceSnippet: cleanDesc.slice(0, 160),
      });
    }
  }
  if (activeProject) projects.push(activeProject);

  // Also detect explicit LCA / UIUX study mentions inside experience if projects section was omitted
  if (projects.length === 0) {
    for (const line of text.split("\n")) {
      const hasStudySignal =
        /\b(conducted|completed|performed|led|built|designed|redesigned|created)\b.*\b(lca|life\s*cycle|epd|prototype|wireframe|case\s*study|website|job\s*board|app)\b/i.test(
          line
        );
      if (hasStudySignal && projects.length < 6) {
        const d = classifyLineDomain(line);
        if (d === "lca_sustainability" || d === "uiux_design") {
          projects.push({
            title: line.replace(/^-\s*/, "").slice(0, 72),
            domain: d === "lca_sustainability" ? "lca" : "uiux",
            description: line.replace(/^-\s*/, ""),
            toolsOrStandardsUsed: SKILL_TAXONOMY.filter((t) =>
              t.aliases.some((a) => aliasMatchesText(line, a))
            ).map((t) => t.canonicalName),
            evidenceSnippet: line.slice(0, 160),
          });
        }
      }
    }
  }

  // 4. Education extraction
  const eduLines =
    sections.education.length > 0 ? sections.education : text.split("\n");
  const education: RawEducationEntry[] = [];
  for (const line of eduLines) {
    const degreeMatch = line.match(
      /\b(ph\.?d|doctorate|m\.?\s*tech|m\.?\s*sc|m\.?\s*s\.?|m\.?\s*des|mba|master(?:'s)?|b\.?\s*tech|b\.?\s*e\.?|b\.?\s*sc|b\.?\s*des|b\.?\s*a\.?|bachelor(?:'s)?|diploma|pgdm)\b/i
    );
    if (!degreeMatch) continue;
    const yearMatch = line.match(/\b((?:19|20)\d{2})\b/);
    const lower = line.toLowerCase();
    education.push({
      degreeRaw: degreeMatch[0],
      fieldOfStudy: line.slice(0, 120),
      institution: null,
      graduationYear: yearMatch ? yearMatch[1] : null,
      isEnvironmentalDomain:
        /\b(environment(?:al)?|sustainab(?:le|ility)|climate|ecolog(?:y|ical)|chemical|energy|forestry|waste|water|green)\b/i.test(
          lower
        ),
      isDesignDomain:
        /\b(design(?:ing)?|hci|human[\s-]computer|interaction|visual|graphic|multimedia|ux|ui|fine\s*arts|communication)\b/i.test(
          lower
        ),
    });
  }

  // 5. Explicit reported years if mentioned in summary/body
  const expYearMention = text.match(
    /\b(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:relevant\s+)?experience\b/i
  );
  const lcaYearMention = text.match(
    /\b(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:experience\s+in\s+|in\s+)?(?:lca|life\s*cycle\s*assessment|sustainability)\b/i
  );
  const uiuxYearMention = text.match(
    /\b(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:experience\s+in\s+|in\s+)?(?:ui\/ux|ux\/ui|ui|ux|product\s*design)\b/i
  );

  if (experiences.length === 0) {
    uncertaintyFlags.push(
      "Could not detect structured date-bounded work experience blocks via heuristic patterns."
    );
  }

  const summary =
    sections.summary.length > 0
      ? sections.summary.slice(0, 3).join(" ").slice(0, 360)
      : text.split("\n").slice(0, 3).join(" ").slice(0, 300) || null;

  return {
    candidateLabel: filename,
    professionalSummary: summary,
    totalExperienceYearsReported: expYearMention
      ? Number(expYearMention[1])
      : null,
    lcaExperienceYearsReported: lcaYearMention
      ? Number(lcaYearMention[1])
      : null,
    uiuxExperienceYearsReported: uiuxYearMention
      ? Number(uiuxYearMention[1])
      : null,
    skills,
    experiences,
    projects,
    education,
    certificationsAndStandards: skills
      .filter((s) => s.domainHint === "lca_sustainability")
      .map((s) => s.rawName),
    portfolioOrProfileUrls: parsed.extractedHyperlinks,
    roleKeywords: skills.map((s) => s.rawName),
    uncertaintyFlags,
  };
}

export interface ExtractionExecutionResult {
  rawExtraction: RawLLMExtraction;
  extractionMode:
    | "llm_structured"
    | "heuristic_fallback"
    | "skipped_due_to_parse_error";
  diagnostics: DiagnosticIssue[];
}

/**
 * Extracts structured candidate JSON using Gemini 2.5 Flash (@google/genai) when configured,
 * or transparently falls back to deterministic heuristic extraction.
 */
export async function extractResumeProfile(
  filename: string,
  parsed: ParsedDocumentResult
): Promise<ExtractionExecutionResult> {
  if (parsed.status === "failed" || !parsed.normalizedText.trim()) {
    return {
      rawExtraction: {
        candidateLabel: filename,
        professionalSummary: null,
        totalExperienceYearsReported: null,
        lcaExperienceYearsReported: null,
        uiuxExperienceYearsReported: null,
        skills: [],
        experiences: [],
        projects: [],
        education: [],
        certificationsAndStandards: [],
        portfolioOrProfileUrls: parsed.extractedHyperlinks,
        roleKeywords: [],
        uncertaintyFlags: [
          "Extraction skipped because document parsing failed or yielded insufficient text.",
        ],
      },
      extractionMode: "skipped_due_to_parse_error",
      diagnostics: [],
    };
  }

  const apiKey =
    process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();

  if (!apiKey) {
    return {
      rawExtraction: heuristicFallbackExtract(filename, parsed),
      extractionMode: "heuristic_fallback",
      diagnostics: [
        {
          stage: "llm_extraction",
          severity: "info",
          code: "INFO_HEURISTIC_FALLBACK_NO_API_KEY",
          message:
            "GEMINI_API_KEY is not configured; used deterministic heuristic extractor (mode: heuristic_fallback).",
        },
      ],
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: buildExtractionUserPrompt(filename, parsed),
      config: {
        systemInstruction: EXTRACTION_SYSTEM_PROMPT,
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: GEMINI_RESPONSE_SCHEMA,
      },
    });

    const jsonText = response.text?.trim() ?? "";
    if (!jsonText) {
      throw new Error("Empty response from Gemini 2.5 Flash.");
    }

    const parsedJson = JSON.parse(jsonText);
    const validated = RawLLMExtractionSchema.parse(parsedJson);

    return {
      rawExtraction: validated,
      extractionMode: "llm_structured",
      diagnostics: [],
    };
  } catch (err) {
    const reason =
      err instanceof Error ? err.message : "unknown LLM extraction failure";
    return {
      rawExtraction: heuristicFallbackExtract(filename, parsed),
      extractionMode: "heuristic_fallback",
      diagnostics: [
        {
          stage: "llm_extraction",
          severity: "warning",
          code: "WARN_LLM_FAILED_FALLBACK_TO_HEURISTIC",
          message: `Gemini structured extraction failed (${reason}); fell back to deterministic heuristic extraction.`,
        },
      ],
    };
  }
}

