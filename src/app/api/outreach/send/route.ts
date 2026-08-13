import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { currentUser } from "@/lib/auth/session";
import { hunts, users } from "@/lib/db/collections";
import { sendMail } from "@/lib/gmail/send";
import type { CompanyDraft } from "@/lib/outreach/draft-company";

export const dynamic = "force-dynamic";

/**
 * POST /api/outreach/send — sends one draft.
 *
 * Deliberately one at a time, triggered by the user. There is no bulk send:
 * outreach that goes out without a human reading it is how a domain gets
 * marked as spam, and the whole product depends on these landing.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user?._id) {
    return NextResponse.json({ ok: false, error: "Please log in first." }, { status: 401 });
  }
  if (!user.gmail) {
    return NextResponse.json(
      { ok: false, error: "Connect Gmail before sending." },
      { status: 400 }
    );
  }

  try {
    const { huntId, key, subject, body, to } = await request.json();

    if (typeof huntId !== "string" || !ObjectId.isValid(huntId) || typeof key !== "string") {
      return NextResponse.json({ ok: false, error: "Which draft?" }, { status: 400 });
    }

    const col = await hunts();
    // Scoped to the owner, so a hunt id alone cannot send from someone else's.
    const hunt = await col.findOne({ _id: new ObjectId(huntId), userId: user._id });
    if (!hunt) return NextResponse.json({ ok: false, error: "Hunt not found." }, { status: 404 });

    const drafts = (hunt.drafts ?? []) as CompanyDraft[];
    const draft = drafts.find(d => d.key === key);
    if (!draft) return NextResponse.json({ ok: false, error: "Draft not found." }, { status: 404 });

    if (draft.sentAt) {
      return NextResponse.json(
        { ok: false, error: "That draft has already been sent." },
        { status: 409 }
      );
    }

    // The edited text from the screen wins over what was stored, so what the
    // user is looking at is exactly what goes out.
    const finalTo = (typeof to === "string" && to.trim()) || draft.to;
    const finalSubject = (typeof subject === "string" && subject.trim()) || draft.subject;
    const finalBody = (typeof body === "string" && body.trim()) || draft.body;

    if (!finalTo) {
      return NextResponse.json(
        { ok: false, error: "No recipient — add an address before sending." },
        { status: 400 }
      );
    }
    if (!finalSubject || !finalBody) {
      return NextResponse.json(
        { ok: false, error: "The draft is empty." },
        { status: 400 }
      );
    }

    const attachments =
      user.emailSettings?.attachResume !== false && user.resume
        ? [
            {
              filename: user.resume.filename,
              mimeType: user.resume.mimeType,
              content: Buffer.from(user.resume.data.buffer),
            },
          ]
        : [];

    const sent = await sendMail(user._id, {
      to: finalTo,
      from: user.gmail.email,
      subject: finalSubject,
      body: finalBody,
      attachments,
    });

    // Record the sent state against the specific draft.
    await col.updateOne(
      { _id: new ObjectId(huntId), userId: user._id, "drafts.key": key },
      {
        $set: {
          "drafts.$.sentAt": new Date(),
          "drafts.$.sentMessageId": sent.id,
          "drafts.$.approved": true,
          "drafts.$.to": finalTo,
          "drafts.$.subject": finalSubject,
          "drafts.$.body": finalBody,
        },
      }
    );

    return NextResponse.json({ ok: true, messageId: sent.id, attached: attachments.length > 0 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not send." },
      { status: 502 }
    );
  }
}

/** PUT /api/outreach/send — saves email settings. */
export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user?._id) {
    return NextResponse.json({ ok: false, error: "Please log in first." }, { status: 401 });
  }

  const body = await request.json();
  const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
    typeof value === "string" && (allowed as readonly string[]).includes(value)
      ? (value as T)
      : fallback;

  await (await users()).updateOne(
    { _id: user._id },
    {
      $set: {
        emailSettings: {
          tone: pick(body.tone, ["cold-intro", "warm-direct", "formal", "concise"] as const, "cold-intro"),
          length: pick(body.length, ["short", "standard", "detailed"] as const, "standard"),
          callToAction: pick(body.callToAction, ["chat", "meet", "either", "none"] as const, "either"),
          includeProjects: body.includeProjects !== false,
          includePortfolio: body.includePortfolio !== false,
          includeGithub: body.includeGithub !== false,
          attachResume: body.attachResume !== false,
          customInstructions:
            typeof body.customInstructions === "string"
              ? body.customInstructions.slice(0, 2000)
              : undefined,
          signature:
            typeof body.signature === "string" ? body.signature.slice(0, 500) : undefined,
          updatedAt: new Date(),
        },
      },
    }
  );

  return NextResponse.json({ ok: true });
}
