import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { currentUser } from "@/lib/auth/session";
import { usageSummary } from "@/lib/billing/usage";
import { formatMoney, toLocal } from "@/lib/billing/currency";
import { assets } from "@/lib/assets";
import { HuntLauncher, type HuntJobState } from "@/components/hunt-launcher";
import { COUNTRIES } from "@/lib/geo";
import { hunts } from "@/lib/db/collections";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your JobHunting dashboard.",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const profile = user.profile;
  const hasProfile = Boolean(profile?.fullName);
  const hasBriefing = Boolean(user.hunterSummary);

  const usage = await usageSummary(user._id!);
  const money = await toLocal(usage.totalUsd, profile?.countryCode);

  // Setup lives on the profile; this page is the hunting surface.
  const ready = hasProfile && hasBriefing;

  const job: HuntJobState | null = user.huntJob
    ? {
        status: user.huntJob.status,
        stage: user.huntJob.stage,
        progress: user.huntJob.progress,
        found: user.huntJob.found,
        huntId: user.huntJob.huntId,
        error: user.huntJob.error,
      }
    : null;

  // Everything we know they could plausibly apply for, deduped case-insensitively.
  const availableRoles = [
    ...(user.hunterSummary?.suggestedRoles ?? []),
    ...(profile?.targetRoles ?? []),
  ].filter((r, i, all) => all.findIndex(o => o.toLowerCase() === r.toLowerCase()) === i);

  const past = await hunts().then(c =>
    c.find({ userId: user._id }).sort({ createdAt: -1 }).limit(5).toArray()
  );

  return (
    <AppShell username={user.username} usageDisplay={formatMoney(money.amount, money.currency)}>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Welcome, {user.username}.
        </h1>
        <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
          {ready
            ? "Hunter has your briefing and is ready to start hunting."
            : "Finish setting up your profile and Hunter can get to work."}
        </p>
      </header>

      {/* Readiness checklist — three across, not stacked down the page. */}
      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        {[
          {
            done: Boolean(user.resume),
            icon: "resume-upload" as const,
            title: "Resume added",
            body: user.resume ? user.resume.filename : "Upload a PDF or DOCX on your profile.",
          },
          {
            done: hasProfile,
            icon: "resume-scan" as const,
            title: "Details confirmed",
            body: hasProfile
              ? `${profile?.skills?.length ?? 0} skills · ${profile?.projects?.length ?? 0} projects`
              : "Check what we read from your resume.",
          },
          {
            done: hasBriefing,
            icon: "hunter" as const,
            title: "Hunter briefed",
            body: hasBriefing
              ? `Read ${user.hunterSummary?.sourcesReviewed?.length ?? 0} sources about you.`
              : "Send your details to Hunter.",
          },
        ].map(item => (
          <section key={item.title} className="card flex items-start gap-4 p-6">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                item.done
                  ? "is-selected"
                  : "border-[var(--line-strong)]"
              }`}
            >
              {item.done ? (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 13 4 4L19 7" />
                </svg>
              ) : (
                <Icon name={item.icon} className="h-5 w-5" />
              )}
            </span>
            <div className="min-w-0">
              <h2 className="font-semibold tracking-tight">{item.title}</h2>
              <p className="mt-1 truncate text-sm text-[var(--muted)]">{item.body}</p>
            </div>
          </section>
        ))}
      </div>

      {/* ------------------------------------------------- hunting area */}
      <div className="mt-5">
        {ready ? (
          <HuntLauncher
            countries={COUNTRIES}
            ownCountry={profile?.country}
            availableRoles={availableRoles}
            job={job}
          />
        ) : (
          <section className="card flex flex-col items-center gap-6 p-10 text-center lg:p-16">
            <Image
              src={assets.emptyNoResume.src}
              alt=""
              width={assets.emptyNoResume.width}
              height={assets.emptyNoResume.height}
              className="art w-full max-w-xs"
              sizes="20rem"
            />
            <div className="max-w-lg">
              <h2 className="text-xl font-semibold tracking-tight">Set up your profile first</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                Hunter needs your resume and a briefing before it can search for you.
              </p>
            </div>
            <Link
              href="/profile"
              className="inline-flex items-center gap-2 rounded-xl btn-accent px-6 py-3.5 text-sm font-medium shadow-[var(--shadow-md)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg)]"
            >
              <Icon name="resume-upload" className="h-4 w-4" />
              Go to profile
            </Link>
          </section>
        )}
      </div>

      {/* --------------------------------------------------- past hunts */}
      {!!past.length && (
        <section className="mt-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Past hunts</h2>
          <ul className="mt-4 space-y-3">
            {past.map(hunt => {
              const companies = hunt.companies as { emails?: string[] }[];
              const contacts = companies.filter(c => c.emails?.length).length;

              return (
                <li key={String(hunt._id)}>
                  <Link
                    href={`/hunts/${hunt._id}`}
                    className="card flex flex-wrap items-center justify-between gap-4 p-5"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{hunt.role}</p>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        {new Date(hunt.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm text-[var(--muted)]">
                      {companies.length} companies · {contacts} with a contact
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </AppShell>
  );
}
