import { afterEach, describe, expect, it, vi } from "vitest";
import type { ParsedDocumentResult } from "@/lib/schemas";

const { generateContentMock, googleGenAiCtorMock } = vi.hoisted(() => {
  const generateContentMock = vi.fn();
  const googleGenAiCtorMock = vi.fn().mockImplementation(() => ({
    models: {
      generateContent: generateContentMock,
    },
  }));
  return { generateContentMock, googleGenAiCtorMock };
});

vi.mock("@google/genai", () => {
  return {
    Type: {
      OBJECT: "OBJECT",
      STRING: "STRING",
      NUMBER: "NUMBER",
      ARRAY: "ARRAY",
      BOOLEAN: "BOOLEAN",
    },
    GoogleGenAI: googleGenAiCtorMock,
  };
});

import { extractResumeProfile } from "./extractor";

describe("extractResumeProfile Gemini 1.5 Flash v1beta integration", () => {
  const originalKey = process.env.GEMINI_API_KEY;

  afterEach(() => {
    generateContentMock.mockReset();
    googleGenAiCtorMock.mockClear();
    if (originalKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalKey;
    }
  });

  it("initializes GoogleGenAI with v1beta and calls model 'gemini-1.5-flash-latest'", async () => {
    process.env.GEMINI_API_KEY = "test-api-key";

    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        candidateLabel: "test_resume.docx",
        professionalSummary: "LCA Consultant with GaBi and ISO 14040 experience.",
        totalExperienceYearsReported: 3,
        lcaExperienceYearsReported: 3,
        uiuxExperienceYearsReported: null,
        skills: [
          {
            rawName: "GaBi",
            domainHint: "lca_sustainability",
            evidenceSnippet: "GaBi and ISO 14040",
          },
        ],
        experiences: [],
        projects: [],
        education: [],
        certificationsAndStandards: ["ISO 14040"],
        portfolioOrProfileUrls: [],
        roleKeywords: ["GaBi", "LCA"],
        uncertaintyFlags: [],
      }),
    });

    const parsed: ParsedDocumentResult = {
      fileType: "docx",
      status: "success",
      parserUsed: "mammoth+ooxml",
      normalizedText: "LCA Consultant experienced in GaBi and ISO 14040 studies across 3 projects.",
      rawHtmlPreview: null,
      charCount: 73,
      wordCount: 12,
      pageOrParagraphCount: 1,
      hadTablesOrTextBoxes: false,
      extractedHyperlinks: [],
      diagnostics: [],
    };

    const result = await extractResumeProfile("test_resume.docx", parsed);

    expect(googleGenAiCtorMock).toHaveBeenCalledWith({
      apiKey: "test-api-key",
      httpOptions: { apiVersion: "v1beta" },
    });
    expect(generateContentMock).toHaveBeenCalledTimes(1);
    expect(generateContentMock.mock.calls[0]?.[0]?.model).toBe(
      "gemini-1.5-flash-latest"
    );
    expect(result.extractionMode).toBe("llm_structured");
    expect(result.diagnostics).toHaveLength(0);
    expect(result.rawExtraction.skills[0]?.rawName).toBe("GaBi");
  });
});

