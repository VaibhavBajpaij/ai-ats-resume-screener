import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { parseResumeBuffer } from "./index";
import { renderPageItemsByCoordinates } from "./pdf-parser";

describe("parseResumeBuffer & format routing", () => {
  it("fails gracefully on empty buffers", async () => {
    const res = await parseResumeBuffer(Buffer.alloc(0), "empty.pdf");
    expect(res.status).toBe("failed");
    expect(res.diagnostics[0]?.code).toBe("ERR_EMPTY_FILE");
  });

  it("fails gracefully on legacy binary .doc signature", async () => {
    const legacyDoc = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    const res = await parseResumeBuffer(legacyDoc, "old-resume.doc");
    expect(res.status).toBe("failed");
    expect(res.diagnostics[0]?.code).toBe("ERR_LEGACY_DOC_UNSUPPORTED");
  });

  it("fails gracefully on oversized buffers > 4.5 MB", async () => {
    const big = Buffer.alloc(4.6 * 1024 * 1024);
    const res = await parseResumeBuffer(big, "huge.pdf");
    expect(res.status).toBe("failed");
    expect(res.diagnostics[0]?.code).toBe("ERR_FILE_TOO_LARGE");
  });

  it("fails gracefully on corrupted DOCX zip archives with ERR_DOCX_CORRUPT_ARCHIVE", async () => {
    const corruptZip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00, 0xde, 0xad, 0xbe, 0xef]);
    const res = await parseResumeBuffer(corruptZip, "corrupt.docx");
    expect(res.fileType).toBe("docx");
    expect(res.status).toBe("failed");
    expect(res.diagnostics[0]?.code).toBe("ERR_DOCX_CORRUPT_ARCHIVE");
  });

  it("extracts DOCX body, text boxes, headers, and external hyperlinks via OOXML", async () => {
    const zip = new JSZip();
    zip.file(
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
       <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
         <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
         <Default Extension="xml" ContentType="application/xml"/>
         <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
       </Types>`
    );
    zip.file(
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
       <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
         <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
       </Relationships>`
    );
    zip.file(
      "word/document.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
       <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
         <w:body>
           <w:p><w:r><w:t>Senior LCA Consultant with 4 years experience using GaBi and SimaPro.</w:t></w:r></w:p>
           <w:p><w:r><w:t>Completed 3 ISO 14040 and ISO 14044 studies for manufacturing clients.</w:t></w:r></w:p>
           <w:p><w:r><w:txbxContent><w:p><w:r><w:t>Hidden TextBox Skill: EPD &amp; OpenLCA</w:t></w:r></w:p></w:txbxContent></w:r></w:p>
         </w:body>
       </w:document>`
    );
    zip.file(
      "word/header1.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
       <w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
         <w:p><w:r><w:t>Header Portfolio Link: Figma Case Studies</w:t></w:r></w:p>
       </w:hdr>`
    );
    zip.file(
      "word/_rels/document.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
       <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
         <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://www.figma.com/file/example-portfolio" TargetMode="External"/>
       </Relationships>`
    );

    const buf = await zip.generateAsync({ type: "nodebuffer" });
    const res = await parseResumeBuffer(buf, "test_resume.docx");

    expect(res.fileType).toBe("docx");
    expect(res.status).toBe("partial"); // under 350 chars triggers sparse warning, still parses cleanly
    expect(res.normalizedText).toContain("GaBi and SimaPro");
    expect(res.normalizedText).toContain("Hidden TextBox Skill: EPD & OpenLCA");
    expect(res.normalizedText).toContain("Header Portfolio Link: Figma Case Studies");
    expect(res.extractedHyperlinks).toContain("https://www.figma.com/file/example-portfolio");
  });

  it("handles scanned/image-only PDF gracefully with ERR_PDF_SCANNED_OR_IMAGE_ONLY", async () => {
    const minimalEmptyPdf = Buffer.from(
      `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer << /Size 4 /Root 1 0 R >>
startxref
190
%%EOF`,
      "utf-8"
    );

    const res = await parseResumeBuffer(minimalEmptyPdf, "scanned.pdf");
    expect(res.fileType).toBe("pdf");
    expect(res.status).toBe("failed");
    expect(
      res.diagnostics.some((d) => d.code === "ERR_PDF_SCANNED_OR_IMAGE_ONLY")
    ).toBe(true);
  });

  it("groups PDF text items by Y coordinate (|Δy| <= 3pt) and preserves columns", () => {
    const output = renderPageItemsByCoordinates([
      { str: "Skills:", transform: [1, 0, 0, 1, 40, 700], width: 35 },
      { str: "Experience", transform: [1, 0, 0, 1, 300, 701.5], width: 60 },
      { str: "GaBi,", transform: [1, 0, 0, 1, 40, 680], width: 28 },
      { str: "SimaPro", transform: [1, 0, 0, 1, 72, 680], width: 42 },
    ]);

    const lines = output.split("\n");
    expect(lines[0]).toBe("Skills: | Experience");
    expect(lines[1]).toBe("GaBi, SimaPro");
  });
});

