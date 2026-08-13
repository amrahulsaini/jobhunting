import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { currentUser } from "@/lib/auth/session";
import { hunts, users } from "@/lib/db/collections";
import { draftForCompanies } from "@/lib/outreach/draft-company";
import { recordUsage } from "@/lib/billing/usage";
import type { EnrichResult } from "@/lib/hunting/enrich";
import type { UserProfile, HunterSummary, EmailSettings } from "@/lib/db/collections";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const STALE_AFTER_MS = 15 * 60 * 1000;
const MAX_PER_RUN = 25;

/**
 * Drafts in the background and writes progress to the user document, matching
 * how briefings and hunts already work — so closing the tab does not cancel it.
 */
async function runDrafting({
  userId,
  huntId,
  companies,
  profile,
  briefing,
  settings,
}: {
  userId: ObjectId;
  huntId: ObjectId;
  companies: EnrichResult[];
  profile: UserProfile;
  briefing?: HunterSummary;
  settings?: EmailSettings;
}) {
  const col = await users();

  const report = (stage: string, progress: number, done: number) =>
    void col.updateOne(
      { _id: userId },
      {
        $set: {
          "draftJob.stage": stage,
          "draftJob.progress": progress,
          "draftJob.drafted": done,
        },
      }
    );

  try {
    const { drafts, usages } = await draftForCompanies(
      companies,
      profile,
      briefing,
      (done, total, name) =>
        report(
          `Writing to ${name} (${done + 1} of ${total})`,
          5 + Math.round((done / Math.max(total, 1)) * 90),
          done
        ),
      settings
    );

    for (const usage of usages) await recordUsage(userId, "outreach-draft", usage);

    // Drafts live on the hunt they came from, so they stay tied to the evidence.
    await hunts().then(c => c.updateOne({ _id: huntId, userId }, { $set: { drafts } }));

    await col.updateOne(
      { _id: userId },
      {
        $set: {
          draftJob: {
            status: "done",
            stage: `${drafts.length} drafts ready`,
            progress: 100,
            drafted: drafts.length,
            huntId: String(huntId),
            startedAt: new Date(),
            finishedAt: new Date(),
          },
        },
      }
    );
  } catch (error) {
    await col.updateOne(
      { _id: userId },
      {
        $set: {
          "draftJob.status": "failed",
          "draftJob.stage": "Failed",
          "draftJob.error": error instanceof Error ? error.message : "Drafting failed.",
          "draftJob.finishedAt": new Date(),
        },
      }
    );
  }
}

/** POST /api/outreach — drafts emails for the selected companies in a hunt. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user?._id) {
    return NextResponse.json({ ok: false, error: "Please log in first." }, { status: 401 });
  }
  if (!user.profile?.fullName) {
    return NextResponse.json(
      { ok: false, error: "Complete your profile before drafting." },
      { status: 400 }
    );
  }

  const { huntId, keys } = await request.json();
  if (typeof huntId !== "string" || !ObjectId.isValid(huntId)) {
    return NextResponse.json({ ok: false, error: "Which hunt?" }, { status: 400 });
  }

  // Scoped to the owner, so a hunt id alone cannot draft against someone else's.
  const hunt = await hunts().then(c =>
    c.findOne({ _id: new ObjectId(huntId), userId: user._id })
  );
  if (!hunt) return NextResponse.json({ ok: false, error: "Hunt not found." }, { status: 404 });

  const all = hunt.companies as EnrichResult[];
  const wanted = new Set(Array.isArray(keys) ? keys.filter((k): k is string => typeof k === "string") : []);

  const selected = (wanted.size ? all.filter(c => wanted.has(c.domain || c.name)) : all).slice(
    0,
    MAX_PER_RUN
  );

  if (!selected.length) {
    return NextResponse.json({ ok: false, error: "Select at least one company." }, { status: 400 });
  }

  const col = await users();
  const now = new Date();

  // Atomic claim so a double click cannot start two drafting runs.
  const claimed = await col.updateOne(
    {
      _id: user._id,
      $or: [
        { draftJob: { $exists: false } },
        { "draftJob.status": { $ne: "running" } },
        { "draftJob.startedAt": { $lt: new Date(now.getTime() - STALE_AFTER_MS) } },
      ],
    },
    {
      $set: {
        draftJob: {
          status: "running",
          stage: "Starting up",
          progress: 2,
          drafted: 0,
          huntId,
          startedAt: now,
        },
      },
    }
  );

  if (claimed.modifiedCount === 0) {
    return NextResponse.json({ ok: true, alreadyRunning: true });
  }

  void runDrafting({
    userId: user._id,
    huntId: new ObjectId(huntId),
    companies: selected,
    profile: user.profile,
    briefing: user.hunterSummary,
    settings: user.emailSettings,
  });

  return NextResponse.json({ ok: true, started: true, count: selected.length });
}

/** GET /api/outreach — drafting job state, polled by the client. */
export async function GET() {
  const user = await currentUser();
  if (!user?._id) {
    return NextResponse.json({ ok: false, error: "Please log in first." }, { status: 401 });
  }

  const job = user.draftJob ?? null;
  return NextResponse.json({ ok: true, job });
}
