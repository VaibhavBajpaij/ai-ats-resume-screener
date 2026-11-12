import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

describe("POST /api/analyze validation", () => {
  it("returns 400 Bad Request on malformed non-multipart POST bodies", async () => {
    const req = new NextRequest("http://localhost:3000/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hello: "world" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Invalid form data" });
  });

  it("rejects .txt uploads gracefully with 400 Bad Request", async () => {
    const form = new FormData();
    const txtFile = new File(["Plain text resume content"], "resume.txt", {
      type: "text/plain",
    });
    form.append("file", txtFile);

    const req = new NextRequest("http://localhost:3000/api/analyze", {
      method: "POST",
      body: form,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      error: "Unsupported format. Please upload a PDF or DOCX.",
    });
  });
});

