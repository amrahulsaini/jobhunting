import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { users, type UserProfile } from "@/lib/db/collections";

export const dynamic = "force-dynamic";

const str = (v: unknown): string | undefined => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : undefined;
};

const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(x => (typeof x === "string" ? x.trim() : "")).filter(Boolean) : [];

/**
 * PUT /api/profile — saves the profile the user reviewed and corrected.
 *
 * Everything is re-validated here rather than trusted from the client: the
 * browser form is a convenience, not a security boundary.
 */
export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user?._id) {
    return NextResponse.json({ ok: false, error: "Please log in first." }, { status: 401 });
  }

  try {
    const body = await request.json();

    const profile: UserProfile = {
      fullName: str(body.fullName),
      headline: str(body.headline),
      email: str(body.email),
      phone: str(body.phone),
      countryCode: str(body.countryCode)?.toUpperCase(),
      country: str(body.country),
      countrySource: body.countrySource === "manual" ? "manual" : body.countrySource,
      seniority: str(body.seniority),
      yearsExperience:
        typeof body.yearsExperience === "number" && Number.isFinite(body.yearsExperience)
          ? body.yearsExperience
          : undefined,
      targetRoles: strArray(body.targetRoles),
      skills: strArray(body.skills),
      domains: strArray(body.domains),
      highlights: strArray(body.highlights),
      projects: Array.isArray(body.projects)
        ? body.projects
            .map((p: Record<string, unknown>) => ({
              name: str(p?.name) ?? "",
              description: str(p?.description),
              url: str(p?.url),
              tech: strArray(p?.tech),
            }))
            .filter((p: { name: string }) => p.name.length > 0)
        : [],
      social: {
        linkedin: str(body.social?.linkedin),
        github: str(body.social?.github),
        portfolio: str(body.social?.portfolio),
        twitter: str(body.social?.twitter),
      },
      updatedAt: new Date(),
    };

    if (!profile.fullName) {
      return NextResponse.json({ ok: false, error: "Your name is required." }, { status: 400 });
    }
    if (!profile.skills?.length) {
      return NextResponse.json(
        { ok: false, error: "Add at least one technical skill." },
        { status: 400 }
      );
    }

    const col = await users();
    await col.updateOne(
      { _id: user._id },
      {
        $set: {
          profile,
          resumeAddedAt: user.resumeAddedAt ?? new Date(),
          ...(typeof body.resumeText === "string" && body.resumeText.trim()
            ? { resumeText: body.resumeText.slice(0, 40_000) }
            : {}),
        },
      }
    );

    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not save your profile." },
      { status: 500 }
    );
  }
}
