import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { users, type HunterSummary } from "@/lib/db/collections";

export const dynamic = "force-dynamic";

const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(x => (typeof x === "string" ? x : "")).filter(Boolean) : [];

/**
 * PATCH /api/hunter/edit — saves a briefing the user has curated.
 *
 * Only the list sections are writable, and only by removing or reordering what
 * Hunter already produced. Prose fields are left as generated, so a saved
 * briefing is always something the model actually wrote, never something typed
 * in and then presented as analysis.
 */
export async function PATCH(request: Request) {
  const user = await currentUser();
  if (!user?._id) {
    return NextResponse.json({ ok: false, error: "Please log in first." }, { status: 401 });
  }
  if (!user.hunterSummary) {
    return NextResponse.json({ ok: false, error: "There is no briefing to edit." }, { status: 404 });
  }

  try {
    const body = await request.json();
    const current = user.hunterSummary;

    // Everything is filtered against what already exists, so this endpoint can
    // only ever remove items — it cannot be used to inject new claims.
    // An omitted field means "leave this alone", not "empty it" — otherwise a
    // partial request silently destroys every section it did not mention.
    const keepFrom = (existing: string[] | undefined, incoming: unknown): string[] => {
      if (!Array.isArray(incoming)) return existing ?? [];
      const allowed = new Set(existing ?? []);
      return strArray(incoming).filter(item => allowed.has(item));
    };

    const next: HunterSummary = {
      ...current,
      strengths: keepFrom(current.strengths, body.strengths),
      differentiators: keepFrom(current.differentiators, body.differentiators),
      gaps: keepFrom(current.gaps, body.gaps),
      suggestedRoles: keepFrom(current.suggestedRoles, body.suggestedRoles),
      targetCompanies: keepFrom(current.targetCompanies, body.targetCompanies),
      searchKeywords: keepFrom(current.searchKeywords, body.searchKeywords),
      projectAnalysis: Array.isArray(body.projectAnalysis)
        ? (current.projectAnalysis ?? []).filter(p =>
            body.projectAnalysis.some((incoming: { name?: string }) => incoming?.name === p.name)
          )
        : current.projectAnalysis,
    };

    const col = await users();
    await col.updateOne({ _id: user._id }, { $set: { hunterSummary: next } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not save." },
      { status: 500 }
    );
  }
}
