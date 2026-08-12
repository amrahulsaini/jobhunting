"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

export interface JobState {
  status: "running" | "done" | "failed";
  stage: string;
  progress: number;
  sourcesFound: number;
  error?: string;
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
      {/* A quarter arc is what makes the rotation readable. */}
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Live view of a running briefing.
 *
 * The job runs on the server and its progress lives in the database, so this
 * polls rather than holding state: closing the tab, reloading or opening the
 * page elsewhere all pick the same run back up exactly where it is.
 */
export function HunterProgress({ initial }: { initial: JobState }) {
  const router = useRouter();
  const [job, setJob] = useState<JobState>(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * The server reports discrete milestones, and generation holds at 65% for
   * roughly a minute — long enough to look frozen. This creeps the displayed
   * value forward between milestones so the bar always shows life.
   *
   * It only ever moves forward, never overtakes the next milestone, and stops
   * short of 100 so completion still belongs to the server.
   */
  const [drift, setDrift] = useState(initial.progress);

  useEffect(() => {
    if (job.status !== "running") return;

    const id = setInterval(() => {
      setDrift(prev => {
        const ceiling = Math.min(job.progress + 28, 96);
        const from = Math.max(prev, job.progress);
        if (from >= ceiling) return from;
        // Ease off as it approaches the ceiling rather than marching linearly.
        return from + Math.max(0.2, (ceiling - from) * 0.06);
      });
    }, 900);

    return () => clearInterval(id);
  }, [job.progress, job.status]);

  // Derived at render, so a milestone from the server always wins immediately
  // without needing to write state from the effect body.
  const shown = job.status === "done" ? 100 : Math.max(drift, job.progress);

  useEffect(() => {
    if (job.status !== "running") return;

    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/hunter/status", { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;

        if (json.job) {
          setJob(json.job);
          // The finished briefing lives in the server-rendered page, so pull it
          // in. Keep polling afterwards as a safety net: if the refresh is
          // dropped, the next tick asks again rather than stranding this view.
          if (json.job.status === "done") router.refresh();
        }
      } catch {
        // A dropped poll is not fatal; the next tick will catch up.
      }
      // Slower once finished — this is only a retry in case the refresh above
      // did not land.
      if (!cancelled) timer.current = setTimeout(poll, job.status === "running" ? 2000 : 4000);
    };

    timer.current = setTimeout(poll, 1500);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [job.status, router]);

  const failed = job.status === "failed";

  return (
    <section className="card p-7 sm:p-10">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--foreground)]">
          {failed ? <Icon name="hunter" className="h-5 w-5" /> : <Spinner className="h-5 w-5" />}
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tight">
            {failed ? "Hunter could not finish" : "Hunter is reading about you"}
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {failed
              ? job.error ?? "Something went wrong."
              : "This keeps running if you close the tab — come back any time."}
          </p>
        </div>

        <span className="shrink-0 font-mono text-2xl font-semibold tabular-nums">
          {Math.round(shown)}%
        </span>
      </div>

      {/* Progress track. aria attributes so a screen reader gets the same info. */}
      <div
        role="progressbar"
        aria-valuenow={Math.round(shown)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Briefing progress"
        className="mt-7 h-2 w-full overflow-hidden rounded-full bg-[var(--subtle)]"
      >
        <div
          className={`h-full rounded-full bg-[var(--accent)] transition-[width] duration-700 ease-out ${
            failed ? "opacity-40" : ""
          }`}
          style={{ width: `${Math.max(2, Math.min(100, shown))}%` }}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="flex items-center gap-2 text-[var(--muted)]">
          {!failed && <Spinner className="h-3.5 w-3.5" />}
          {job.stage}
        </p>
        {job.sourcesFound > 0 && (
          <p className="text-[var(--muted)]">
            {job.sourcesFound} {job.sourcesFound === 1 ? "source" : "sources"} read
          </p>
        )}
      </div>

      {/* Stage rail, so the wait has visible structure rather than one long bar. */}
      <ol className="mt-8 grid gap-3 border-t border-[var(--line)] pt-6 sm:grid-cols-3">
        {[
          { label: "Collecting your links", at: 5 },
          { label: "Reading your work", at: 8 },
          { label: "Writing the briefing", at: 65 },
        ].map(step => {
          const active = job.progress >= step.at;
          return (
            <li key={step.label} className="flex items-center gap-2.5 text-sm">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  active ? "bg-[var(--accent)]" : "bg-[var(--line-strong)]"
                }`}
              />
              <span className={active ? "" : "text-[var(--muted)]"}>{step.label}</span>
            </li>
          );
        })}
      </ol>

      {failed && (
        <button
          type="button"
          onClick={() => router.refresh()}
          className="mt-7 rounded-xl border border-[var(--line)] px-5 py-3 text-sm font-medium transition-colors hover:bg-[var(--subtle)]"
        >
          Back to my details
        </button>
      )}
    </section>
  );
}
