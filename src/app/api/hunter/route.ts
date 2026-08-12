import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { currentUser } from "@/lib/auth/session";
import { users, type UserProfile } from "@/lib/db/collections";
import { buildHunterSummary } from "@/lib/hunter/summary";
import { recordUsage } from "@/lib/billing/usage";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** A run that started this long ago is assumed dead and can be replaced. */
const STALE_AFTER_MS = 10 * 60 * 1000;

/**
 * Runs the briefing to completion, writing progress to the user document.
 *
 * Deliberately not awaited by the request handler: the HTTP response returns as
 * soon as the job is claimed, and this keeps running in the background. The
 * client polls /api/hunter/status, so closing the tab does not cancel the work.
 *
 * Note this relies on a long-lived Node process. On a serverless platform the
 * runtime may freeze the instance once the response is sent, so production
 * there would need a real queue and worker rather than this.
 */
async function runJob(userId: ObjectId, profile: UserProfile, resumeText?: string) {
  const col = await users();

  // Progress writes are fire-and-forget; a dropped one only means a slightly
  // stale bar, and awaiting them would slow the actual work down.
  const report = (stage: string, progress: number, sourcesFound: number) => {
    void col.updateOne(
      { _id: userId },
      { $set: { "hunterJob.stage": stage, "hunterJob.progress": progress, "hunterJob.sourcesFound": sourcesFound } }
    );
  };

  try {
    const { result, usage } = await buildHunterSummary(profile, resumeText, report);
    await recordUsage(userId, "hunter-summary", usage);

    await col.updateOne(
      { _id: userId },
      {
        $set: {
          hunterSummary: { ...result, generatedAt: new Date() },
          hunterJob: {
            status: "done",
            stage: "Briefing ready",
            progress: 100,
            sourcesFound: result.sourcesReviewed.length,
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
          "hunterJob.status": "failed",
          "hunterJob.stage": "Failed",
          "hunterJob.finishedAt": new Date(),
          "hunterJob.error": error instanceof Error ? error.message : "Hunter could not run.",
        },
      }
    );
  }
}

/** POST /api/hunter — starts a briefing run and returns immediately. */
export async function POST() {
  const user = await currentUser();
  if (!user?._id) {
    return NextResponse.json({ ok: false, error: "Please log in first." }, { status: 401 });
  }
  if (!user.profile?.fullName) {
    return NextResponse.json(
      { ok: false, error: "Complete your profile before sending it to Hunter." },
      { status: 400 }
    );
  }

  const col = await users();
  const now = new Date();

  // Claim the slot atomically: two clicks in quick succession must not start
  // two runs, and only one of them can match this filter.
  const claimed = await col.updateOne(
    {
      _id: user._id,
      $or: [
        { hunterJob: { $exists: false } },
        { "hunterJob.status": { $ne: "running" } },
        { "hunterJob.startedAt": { $lt: new Date(now.getTime() - STALE_AFTER_MS) } },
      ],
    },
    {
      $set: {
        hunterJob: {
          status: "running",
          stage: "Starting up",
          progress: 2,
          sourcesFound: 0,
          startedAt: now,
        },
      },
    }
  );

  if (claimed.modifiedCount === 0) {
    return NextResponse.json({ ok: true, alreadyRunning: true });
  }

  void runJob(user._id, user.profile, user.resumeText);

  return NextResponse.json({ ok: true, started: true });
}

/** DELETE /api/hunter — removes the briefing and clears any job state. */
export async function DELETE() {
  const user = await currentUser();
  if (!user?._id) {
    return NextResponse.json({ ok: false, error: "Please log in first." }, { status: 401 });
  }

  const col = await users();
  // Usage history is deliberately left intact — it is a billing record, not
  // content, and deleting a briefing must not erase what it already cost.
  await col.updateOne({ _id: user._id }, { $unset: { hunterSummary: "", hunterJob: "" } });

  return NextResponse.json({ ok: true });
}
