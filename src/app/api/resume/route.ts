import { NextResponse } from "next/server";
import { Binary } from "mongodb";
import { currentUser } from "@/lib/auth/session";
import { users } from "@/lib/db/collections";
import { extractResumeText, parseResume } from "@/lib/resume/parse";
import { recordUsage } from "@/lib/billing/usage";
import { detectCountry } from "@/lib/geo";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_BYTES = 8 * 1024 * 1024;

const ALLOWED = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/msword", // .doc
  "text/plain",
]);

/**
 * POST /api/resume — stores the file and returns the parsed profile for review.
 *
 * Nothing here is treated as final: the parsed values go back to the user to
 * correct before anything is committed to their profile.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user?._id) {
    return NextResponse.json({ ok: false, error: "Please log in first." }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "No file received." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: "That file is over 8MB. Please upload a smaller resume." },
        { status: 413 }
      );
    }
    if (file.type && !ALLOWED.has(file.type)) {
      return NextResponse.json(
        { ok: false, error: "Upload a PDF, DOCX or plain text file." },
        { status: 415 }
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "application/pdf";

    const { profile, usage } = await parseResume({
      data: bytes.toString("base64"),
      mimeType,
    });

    let { chargedUsd } = await recordUsage(user._id, "resume-parse", usage);

    // Keep the full text alongside the structured profile: the briefing reads it
    // for detail the structured fields necessarily drop. Cheap on flash-lite,
    // and a failure here must not cost the user their upload.
    let resumeText: string | undefined;
    try {
      const extracted = await extractResumeText({ data: bytes.toString("base64"), mimeType });
      resumeText = extracted.text;
      const textUsage = await recordUsage(user._id, "resume-parse", extracted.usage);
      chargedUsd += textUsage.chargedUsd;
    } catch {
      // Structured parsing already succeeded; the transcript is a bonus.
    }

    // Country: prefer what the resume states, fall back to where they are now.
    let countryCode = profile.countryCode;
    let countrySource: "resume" | "ip" | undefined = countryCode ? "resume" : undefined;
    if (!countryCode) {
      const geo = await detectCountry();
      countryCode = geo.countryCode;
      countrySource = geo.countryCode ? "ip" : undefined;
    }

    // Store the original document so the user can re-download exactly what they sent.
    const col = await users();
    await col.updateOne(
      { _id: user._id },
      {
        $set: {
          resume: {
            filename: file.name,
            mimeType,
            size: bytes.length,
            data: new Binary(bytes),
            uploadedAt: new Date(),
          },
          ...(resumeText ? { resumeText: resumeText.slice(0, 40_000) } : {}),
        },
      }
    );

    return NextResponse.json({
      ok: true,
      parsed: { ...profile, countryCode, countrySource },
      file: { filename: file.name, size: bytes.length, mimeType },
      chargedUsd,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not read that resume." },
      { status: 500 }
    );
  }
}

/** DELETE /api/resume — removes the stored resume file and its extracted text. */
export async function DELETE() {
  const user = await currentUser();
  if (!user?._id) {
    return NextResponse.json({ ok: false, error: "Please log in first." }, { status: 401 });
  }

  const col = await users();
  // The confirmed profile survives on purpose: deleting the source document
  // should not silently wipe details the user already reviewed and corrected.
  await col.updateOne({ _id: user._id }, { $unset: { resume: "", resumeText: "" } });

  return NextResponse.json({ ok: true });
}
