import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { currentUser } from "@/lib/auth/session";
import { hunts, users } from "@/lib/db/collections";
import { draftForCompanies, type CompanyDraft } from "@/lib/outreach/draft-company";
import { recordUsage } from "@/lib/billing/usage";
import type { EnrichResult } from "@/lib/hunting/enrich";
import type { UserProfile, HunterSummary, EmailSettings } from "@/lib/db/collections";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const STALE_AFTER_MS = 15 * 60 * 1000;
const MAX_PER_RUN = 25;

/** One company to write to, identified across hunts. */
interface Target {
  huntId: string;
  key: string;
}

/**
 * Drafts in the background and writes progress to the user document, matching
 * how briefings and hunts already work — so closing the tab does not cancel it.
 *
 * Targets may span several hunts, because the user picks companies from one
 * combined list rather than one hunt at a time.
 */
async function runDrafting({
  userId,
  grouped,
  profile,
  briefing,
  settings,
}: {
  userId: ObjectId;
  grouped: Map<string, EnrichResult[]>;
  profile: UserProfile;
  briefing?: HunterSummary;
  settings?: EmailSettings;
}) {
  const col = await users();
  const huntsCol = await hunts();

  const total = [...grouped.values()].reduce((sum, list) => sum + list.length, 0);
  let completed = 0;

  const report = (stage: string) =>
    void col.updateOne(
      { _id: userId },
      {
        $set: {
          "draftJob.stage": stage,
          "draftJob.progress": 5 + Math.round((completed / Math.max(total, 1)) * 90),
          "draftJob.drafted": completed,
        },
      }
    );

  try {
    for (const [huntId, companies] of grouped) {
      const { drafts, usages } = await draftForCompanies(
        companies,
        profile,
        briefing,
        (done, batchTotal, name) => {
          completed = completed - (completed % 1); // keep integer
          report(`Writing to ${name} (${completed + done + 1} of ${total})`);
        },
        settings
      );

      for (const usage of usages) await recordUsage(userId, "outreach-draft", usage);
      completed += drafts.length;

      // Merge rather than replace: drafting five more companies must not wipe
      // the drafts already written for this hunt, sent ones included.
      const hunt = await huntsCol.findOne({ _id: new ObjectId(huntId), userId });
      const existing = (hunt?.drafts ?? []) as CompanyDraft[];
      const fresh = new Map(drafts.map(d => [d.key, d]));

      const merged = [
        // A sent draft is a record of something that happened; never overwrite it.
        ...existing.map(d => (d.sentAt ? d : fresh.get(d.key) ?? d)),
        ...drafts.filter(d => !existing.some(e => e.key === d.key)),
      ];

      await huntsCol.updateOne(
        { _id: new ObjectId(huntId), userId },
        { $set: { drafts: merged } }
      );
    }

    await col.updateOne(
      { _id: userId },
      {
        $set: {
          draftJob: {
            status: "done",
            stage: `${completed} draft${completed === 1 ? "" : "s"} ready`,
            progress: 100,
            drafted: completed,
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

/** POST /api/outreach — drafts emails for the selected companies. */
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

  const body = await request.json();

  // Two shapes accepted: `items` spanning hunts (the Generate tab), or a single
  // `huntId` plus `keys` (the hunt report).
  let targets: Target[] = [];

  if (Array.isArray(body.items)) {
    targets = body.items
      .filter(
        (t: unknown): t is Target =>
          typeof t === "object" &&
          t !== null &&
          typeof (t as Target).huntId === "string" &&
          typeof (t as Target).key === "string" &&
          ObjectId.isValid((t as Target).huntId)
      )
      .slice(0, MAX_PER_RUN);
  } else if (typeof body.huntId === "string" && ObjectId.isValid(body.huntId)) {
    const hunt = await hunts().then(c =>
      c.findOne({ _id: new ObjectId(body.huntId), userId: user._id })
    );
    if (!hunt) return NextResponse.json({ ok: false, error: "Hunt not found." }, { status: 404 });

    const wanted = new Set(
      Array.isArray(body.keys) ? body.keys.filter((k: unknown): k is string => typeof k === "string") : []
    );
    const all = hunt.companies as EnrichResult[];
    targets = (wanted.size ? all.filter(c => wanted.has(c.domain || c.name)) : all)
      .slice(0, MAX_PER_RUN)
      .map(c => ({ huntId: body.huntId, key: c.domain || c.name }));
  }

  if (!targets.length) {
    return NextResponse.json({ ok: false, error: "Select at least one company." }, { status: 400 });
  }

  // Resolve each target to its company, scoped to the owner so a hunt id alone
  // cannot draft against someone else's data.
  const huntsCol = await hunts();
  const grouped = new Map<string, EnrichResult[]>();

  for (const huntId of new Set(targets.map(t => t.huntId))) {
    const hunt = await huntsCol.findOne({ _id: new ObjectId(huntId), userId: user._id });
    if (!hunt) continue;

    const keys = new Set(targets.filter(t => t.huntId === huntId).map(t => t.key));
    const companies = (hunt.companies as EnrichResult[]).filter(c => keys.has(c.domain || c.name));
    if (companies.length) grouped.set(huntId, companies);
  }

  if (!grouped.size) {
    return NextResponse.json({ ok: false, error: "Those companies could not be found." }, { status: 404 });
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
    grouped,
    profile: user.profile,
    briefing: user.hunterSummary,
    settings: user.emailSettings,
  });

  const count = [...grouped.values()].reduce((sum, list) => sum + list.length, 0);
  return NextResponse.json({ ok: true, started: true, count });
}

/** GET /api/outreach — drafting job state, polled by the client. */
export async function GET() {
  const user = await currentUser();
  if (!user?._id) {
    return NextResponse.json({ ok: false, error: "Please log in first." }, { status: 401 });
  }

  return NextResponse.json({ ok: true, job: user.draftJob ?? null });
}
