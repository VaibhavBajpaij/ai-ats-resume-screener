import { NextRequest, NextResponse } from "next/server";
import { processResumeBuffer } from "@/lib/pipeline";
import { MAX_UPLOAD_BYTES } from "@/lib/parsers";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid form data" },
      { status: 400 }
    );
  }

  try {
    const fileEntry = formData.get("file");

    if (!fileEntry || !(fileEntry instanceof File)) {
      return NextResponse.json(
        { error: "Missing 'file' field in multipart/form-data upload." },
        { status: 400 }
      );
    }

    const lowerName = fileEntry.name.toLowerCase();
    const mimeType = fileEntry.type.toLowerCase();
    if (lowerName.endsWith(".txt") || mimeType === "text/plain") {
      return NextResponse.json(
        { error: "Unsupported format. Please upload a PDF or DOCX." },
        { status: 400 }
      );
    }

    if (fileEntry.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          error: `File "${fileEntry.name}" (${(fileEntry.size / (1024 * 1024)).toFixed(2)} MB) exceeds the 4.5 MB upload limit.`,
        },
        { status: 413 }
      );
    }

    const arrayBuffer = await fileEntry.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const record = await processResumeBuffer({
      buffer,
      filename: fileEntry.name || "uploaded_resume",
      origin: "user_upload",
    });

    return NextResponse.json({ candidate: record }, { status: 200 });
  } catch (err) {
    console.error("[/api/analyze] Unexpected error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Unexpected server error analyzing resume.",
      },
      { status: 500 }
    );
  }
}

