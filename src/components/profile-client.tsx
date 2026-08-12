"use client";

import { useState } from "react";
import { ResumeWizard, type ProfileDraft } from "@/components/resume-wizard";
import { HunterBriefing, type Briefing } from "@/components/hunter-briefing";
import { HunterProgress, type JobState } from "@/components/hunter-progress";

/**
 * Switches the profile between setup, a running briefing, and the finished one.
 *
 * A run in progress wins over everything: the server tells us on load whether
 * one is going, so reloading mid-run drops you straight back onto the progress
 * bar rather than a form that looks like nothing happened.
 */
export function ProfileClient({
  briefing,
  job,
  initial,
  countries,
  detectedCountry,
  hasProfile,
  usageDisplay,
}: {
  briefing: Briefing | null;
  job: JobState | null;
  initial?: Partial<ProfileDraft>;
  countries: { code: string; name: string }[];
  detectedCountry?: string;
  hasProfile: boolean;
  usageDisplay?: string;
}) {
  const [editing, setEditing] = useState(false);
  /** Optimistic: covers the gap between clicking start and the server confirming. */
  const [justStarted, setJustStarted] = useState(false);

  /**
   * Derived, not stored.
   *
   * Holding "is it running?" in local state was a bug: once the run finished and
   * the server sent back the completed briefing, the stale local flag still
   * forced the progress view, so the results only appeared after a manual
   * reload. The server's job status is the single source of truth, and it
   * always wins over the optimistic flag.
   */
  const showProgress =
    job?.status === "running" || (justStarted && job?.status !== "done" && job?.status !== "failed");

  if (showProgress) {
    return (
      <HunterProgress
        initial={job ?? { status: "running", stage: "Starting up", progress: 2, sourcesFound: 0 }}
      />
    );
  }

  if (job?.status === "failed" && !editing) {
    return <HunterProgress initial={job} />;
  }

  if (briefing && !editing) {
    return (
      <HunterBriefing
        briefing={briefing}
        usageDisplay={usageDisplay}
        onEdit={() => setEditing(true)}
        onRerun={() => setJustStarted(true)}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <ResumeWizard
        hasProfile={hasProfile}
        countries={countries}
        detectedCountry={detectedCountry}
        initial={initial}
        onStarted={() => {
          setEditing(false);
          setJustStarted(true);
        }}
      />
    </div>
  );
}
