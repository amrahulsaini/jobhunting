import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { ResumeCard } from "@/components/resume-card";
import { ProfileClient } from "@/components/profile-client";
import type { Briefing } from "@/components/hunter-briefing";
import type { JobState } from "@/components/hunter-progress";
import { currentUser } from "@/lib/auth/session";
import { COUNTRIES, detectCountry } from "@/lib/geo";
import { usageSummary } from "@/lib/billing/usage";
import { formatMoney, toLocal } from "@/lib/billing/currency";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

const PURPOSE_LABELS: Record<string, string> = {
  "resume-parse": "Resume parsing",
  "hunter-summary": "Hunter briefing",
  "job-hunting": "Job hunting",
  "outreach-draft": "Email drafting",
  other: "Other",
};

export default async function ProfilePage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const profile = user.profile;
  const hasProfile = Boolean(profile?.fullName);

  // Only pay for a geo lookup when we have nothing better already.
  const detected = profile?.countryCode ? undefined : (await detectCountry()).countryCode;

  const usage = await usageSummary(user._id!);
  const money = await toLocal(usage.totalUsd, profile?.countryCode ?? detected);
  const usageDisplay = formatMoney(money.amount, money.currency);
  // Derive the rate once from the already-converted total, so per-row figures
  // always add up to the headline number.
  const rate = money.usd ? money.amount / money.usd : 1;

  // Mongo hands back Date objects; serialise before crossing into the client.
  const briefing: Briefing | null = user.hunterSummary
    ? {
        ...user.hunterSummary,
        generatedAt: user.hunterSummary.generatedAt?.toISOString?.() ?? undefined,
      }
    : null;

  // Handed to the client so a reload mid-run lands back on the progress bar.
  const job: JobState | null = user.hunterJob
    ? {
        status: user.hunterJob.status,
        stage: user.hunterJob.stage,
        progress: user.hunterJob.progress,
        sourcesFound: user.hunterJob.sourcesFound,
        error: user.hunterJob.error,
      }
    : null;

  return (
    <AppShell username={user.username} usageDisplay={usageDisplay}>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Profile</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{user.email}</p>
      </header>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <section className="card p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Hunter usage</h2>
          <p className="mt-4 text-3xl font-semibold tracking-tight">{usageDisplay}</p>
          {money.currency !== "USD" && (
            <p className="mt-1 text-xs text-[var(--muted)]">{formatMoney(money.usd, "USD")}</p>
          )}
        </section>

        <section className="card p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Activity</h2>
          <dl className="mt-4 grid grid-cols-3 gap-3">
            {[
              ["Calls", usage.calls.toLocaleString()],
              ["Input", usage.inputTokens.toLocaleString()],
              ["Output", usage.outputTokens.toLocaleString()],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</dt>
                <dd className="mt-1 text-lg font-semibold">{value}</dd>
              </div>
            ))}
          </dl>

          {!!usage.byPurpose.length && (
            <ul className="mt-5 space-y-2 border-t border-[var(--line)] pt-4 text-sm">
              {usage.byPurpose.map(row => (
                <li key={row.purpose} className="flex items-center justify-between gap-3">
                  <span className="truncate">{PURPOSE_LABELS[row.purpose] ?? row.purpose}</span>
                  <span className="shrink-0 text-[var(--muted)]">
                    {formatMoney(row.chargedUsd * rate, money.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <ResumeCard
          filename={user.resume?.filename}
          size={user.resume?.size}
          uploadedAt={user.resume?.uploadedAt?.toISOString?.()}
        />
      </div>

      <div className="mt-5">
        <ProfileClient
          briefing={briefing}
          job={job}
          hasProfile={hasProfile}
          countries={COUNTRIES}
          detectedCountry={detected}
          usageDisplay={usageDisplay}
          initial={
            hasProfile
              ? {
                  fullName: profile?.fullName ?? "",
                  headline: profile?.headline ?? "",
                  email: profile?.email ?? "",
                  phone: profile?.phone ?? "",
                  countryCode: profile?.countryCode ?? "",
                  seniority: profile?.seniority ?? "",
                  yearsExperience:
                    profile?.yearsExperience != null ? String(profile.yearsExperience) : "",
                  targetRoles: profile?.targetRoles ?? [],
                  skills: profile?.skills ?? [],
                  domains: profile?.domains ?? [],
                  highlights: profile?.highlights ?? [],
                  projects: profile?.projects ?? [],
                  social: {
                    linkedin: profile?.social?.linkedin ?? "",
                    github: profile?.social?.github ?? "",
                    portfolio: profile?.social?.portfolio ?? "",
                    twitter: profile?.social?.twitter ?? "",
                  },
                }
              : undefined
          }
        />
      </div>
    </AppShell>
  );
}
