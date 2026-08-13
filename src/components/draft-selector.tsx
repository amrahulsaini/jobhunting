"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { Spinner } from "@/components/hunter-progress";

export interface SelectableCompany {
  key: string;
  name: string;
  roleTitle?: string;
  email?: string;
  ats?: string;
  hasCareers: boolean;
}

interface DraftJobState {
  status: "running" | "done" | "failed";
  stage: string;
  progress: number;
  drafted: number;
  error?: string;
}

/**
 * Chooses which companies from a hunt get an email written.
 *
 * Companies with a verified address are pre-selected: those are the ones where
 * a drafted email can actually be sent, so they are the useful default.
 */
export function DraftSelector({
  huntId,
  companies,
  alreadyDrafted,
  job: initialJob,
}: {
  huntId: string;
  companies: SelectableCompany[];
  alreadyDrafted: number;
  job: DraftJobState | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(companies.filter(c => c.email).map(c => c.key))
  );
  const [job, setJob] = useState<DraftJobState | null>(initialJob);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const running = job?.status === "running" || starting;

  useEffect(() => {
    if (job?.status !== "running") return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/outreach", { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        if (json.job) {
          setJob(json.job);
          if (json.job.status === "done") {
            router.refresh();
            return;
          }
        }
      } catch {
        /* a dropped poll is not fatal */
      }
      if (!cancelled) timer.current = setTimeout(poll, 2000);
    };

    timer.current = setTimeout(poll, 1200);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [job?.status, router]);

  const toggle = (key: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  async function start() {
    setError(null);
    setStarting(true);
    try {
      const res = await fetch("/api/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ huntId, keys: [...selected] }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Could not start drafting.");
        return;
      }
      setJob({ status: "running", stage: "Starting up", progress: 2, drafted: 0 });
    } catch {
      setError("Could not reach the server.");
    } finally {
      setStarting(false);
    }
  }

  if (running) {
    return (
      <section className="card p-6 sm:p-7">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--foreground)]">
            <Spinner className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-tight">Hunter is writing your emails</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              One per company, using your profile and what we read off their site. This keeps
              running if you close the tab.
            </p>
          </div>
          <span className="shrink-0 font-mono text-2xl font-semibold tabular-nums">
            {Math.round(job?.progress ?? 2)}%
          </span>
        </div>

        <div
          role="progressbar"
          aria-valuenow={Math.round(job?.progress ?? 2)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Drafting progress"
          className="mt-6 h-2 w-full overflow-hidden rounded-full bg-[var(--subtle)]"
        >
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-700 ease-out"
            style={{ width: `${Math.max(2, Math.min(100, job?.progress ?? 2))}%` }}
          />
        </div>

        <p className="mt-3 flex items-center gap-2 text-sm text-[var(--muted)]">
          <Spinner className="h-3.5 w-3.5" />
          {job?.stage ?? "Starting up"}
        </p>
      </section>
    );
  }

  const withEmail = companies.filter(c => c.email).length;

  return (
    <section className="card p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            {alreadyDrafted ? "Draft more emails" : "Draft your emails"}
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {withEmail} of {companies.length} have a verified address and are selected by default.
            Nothing is sent — you review every draft first.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSelected(new Set(companies.map(c => c.key)))}
            className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--subtle)]"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--subtle)]"
          >
            Clear
          </button>
        </div>
      </div>

      <ul className="mt-5 grid gap-2 sm:grid-cols-2">
        {companies.map(c => {
          const on = selected.has(c.key);
          return (
            <li key={c.key}>
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                  on ? "border-[var(--foreground)]" : "border-[var(--line)] hover:bg-[var(--subtle)]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(c.key)}
                  className="mt-0.5 accent-[var(--foreground)]"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{c.name}</span>
                  {c.roleTitle && (
                    <span className="block truncate text-xs text-[var(--muted)]">{c.roleTitle}</span>
                  )}
                  <span className="mt-1 block truncate text-xs text-[var(--muted)]">
                    {c.email
                      ? c.email
                      : c.ats
                        ? `Applies via ${c.ats}`
                        : c.hasCareers
                          ? "Careers page only"
                          : "No contact found"}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {error && (
        <p role="alert" className="mt-5 rounded-xl border border-[var(--foreground)] px-4 py-3 text-sm">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={start}
        disabled={!selected.size}
        className="btn-accent mt-6 inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-sm font-medium shadow-[var(--shadow-md)] transition-all duration-300 hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40"
      >
        <Icon name="draft-ai" className="h-4 w-4" />
        Draft {selected.size || "no"} email{selected.size === 1 ? "" : "s"}
      </button>
    </section>
  );
}
