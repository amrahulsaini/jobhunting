import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { users } from "@/lib/db/collections";
import { runHunt } from "@/lib/hunting/run";
import { MATCH_COUNTS, ROLE_TYPES, type HuntConfig, type RoleType } from "@/lib/hunting/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** A run older than this is assumed dead and can be replaced. */
const STALE_AFTER_MS = 15 * 60 * 1000;

const VALID_TYPES = new Set(ROLE_TYPES.map(t => t.id));

function parseConfig(body: Record<string, unknown>): HuntConfig | string {
  const scope = body.scope;
  if (scope !== "own" && scope !== "specific" && scope !== "global") {
    return "Choose where to search.";
  }

  const countries = Array.isArray(body.countries)
    ? body.countries.filter((c): c is string => typeof c === "string").slice(0, 10)
    : [];
  if (scope === "specific" && !countries.length) {
    return "Pick at least one country.";
  }

  const roleTypes = (Array.isArray(body.roleTypes) ? body.roleTypes : [])
    .filter((t): t is RoleType => typeof t === "string" && VALID_TYPES.has(t as RoleType));
  if (!roleTypes.length) return "Pick at least one role type.";

  const matches = Number(body.matches);
  if (!MATCH_COUNTS.includes(matches as (typeof MATCH_COUNTS)[number])) {
    return "Choose how many matches to research.";
  }

  const roles = (Array.isArray(body.roles) ? body.roles : [])
    .filter((r): r is string => typeof r === "string" && r.trim().length > 1)
    .map(r => r.trim())
    .slice(0, 6);
  if (!roles.length) return "Pick at least one role to search for.";

  return { scope, countries, roleTypes, matches, roles };
}

/** POST /api/hunt — starts a hunt and returns immediately. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user?._id) {
    return NextResponse.json({ ok: false, error: "Please log in first." }, { status: 401 });
  }
  if (!user.profile?.fullName) {
    return NextResponse.json(
      { ok: false, error: "Complete your profile before hunting." },
      { status: 400 }
    );
  }

  const config = parseConfig(await request.json());
  if (typeof config === "string") {
    return NextResponse.json({ ok: false, error: config }, { status: 400 });
  }

  const col = await users();
  const now = new Date();

  // Claim atomically so a double click cannot start two hunts.
  const claimed = await col.updateOne(
    {
      _id: user._id,
      $or: [
        { huntJob: { $exists: false } },
        { "huntJob.status": { $ne: "running" } },
        { "huntJob.startedAt": { $lt: new Date(now.getTime() - STALE_AFTER_MS) } },
      ],
    },
    {
      $set: {
        huntJob: {
          status: "running",
          stage: "Starting up",
          progress: 2,
          found: 0,
          startedAt: now,
        },
      },
    }
  );

  if (claimed.modifiedCount === 0) {
    return NextResponse.json({ ok: true, alreadyRunning: true });
  }

  void runHunt({
    userId: user._id,
    profile: user.profile,
    briefing: user.hunterSummary,
    config,
  });

  return NextResponse.json({ ok: true, started: true });
}

/** GET /api/hunt — current hunt job state, polled by the client. */
export async function GET() {
  const user = await currentUser();
  if (!user?._id) {
    return NextResponse.json({ ok: false, error: "Please log in first." }, { status: 401 });
  }

  const job = user.huntJob ?? null;
  return NextResponse.json({
    ok: true,
    job: job
      ? {
          status: job.status,
          stage: job.stage,
          progress: job.progress,
          found: job.found,
          huntId: job.huntId,
          error: job.error,
        }
      : null,
  });
}
