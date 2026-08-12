import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { toLocal, formatMoney } from "@/lib/billing/currency";
import { usageSummary } from "@/lib/billing/usage";

export const dynamic = "force-dynamic";

/** GET /api/hunter/status — polled by the client while a briefing runs. */
export async function GET() {
  const user = await currentUser();
  if (!user?._id) {
    return NextResponse.json({ ok: false, error: "Please log in first." }, { status: 401 });
  }

  const job = user.hunterJob ?? null;
  const done = job?.status === "done";

  // Only compute the usage figure once there is something new to show; polling
  // it every two seconds would mean an aggregate query per tick.
  let usageDisplay: string | undefined;
  if (done) {
    const usage = await usageSummary(user._id);
    const money = await toLocal(usage.totalUsd, user.profile?.countryCode);
    usageDisplay = formatMoney(money.amount, money.currency);
  }

  return NextResponse.json({
    ok: true,
    job: job
      ? {
          status: job.status,
          stage: job.stage,
          progress: job.progress,
          sourcesFound: job.sourcesFound,
          error: job.error,
        }
      : null,
    hasSummary: Boolean(user.hunterSummary),
    usageDisplay,
  });
}
