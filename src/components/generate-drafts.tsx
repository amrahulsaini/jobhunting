"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { Spinner } from "@/components/hunter-progress";

export interface Candidate {
  huntId: string;
  key: string;
  company: string;
  roleTitle?: string;
  roleType?: string;
  location?: string;
  website?: string;
  domain?: string;
  email?: string;
  ats?: string;
  careersUrl?: string;
  /** True when this company already has a draft. */
  drafted: boolean;
  sent: boolean;
  /** Which hunt surfaced it, for grouping. */
  huntRole: string;
  huntDate: string;
}

interface DraftJobState {
  status: "running" | "done" | "failed";
  stage: string;
  progress: number;
  drafted: number;
  error?: string;
}

type Filter = "all" | "with-email" | "not-drafted";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "with-email", label: "Has an address" },
  { id: "not-drafted", label: "Not drafted yet" },
  { id: "all", label: "Everything" },
];

/**
 * Picks companies to write to, across every hunt.
 *
 * The hunt report can start drafting for one hunt, but people think in terms of
 * "everyone I have found", not "everyone from Tuesday's search" — so this is
 * one combined list.
 */
export function GenerateDrafts({
  candidates,
  job: initialJob,
}: {
  candidates: Candidate[];
  job: DraftJobState | null;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("with-email");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [job, setJob] = useState<DraftJobState | null>(initialJob);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const running = job?.status === "running" || starting;

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return candidates.filter(c => {
      if (filter === "with-email" && !c.email) return false;
      if (filter === "not-drafted" && c.drafted) return false;
      if (!term) return true;
      return `${c.company} ${c.roleTitle ?? ""} ${c.domain ?? ""}`.toLowerCase().includes(term);
    });
  }, [candidates, filter, search]);

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

  const idOf = (c: Candidate) => `${c.huntId}:${c.key}`;

  const toggle = (c: Candidate) =>
    setSelected(prev => {
      const next = new Set(prev);
      const id = idOf(c);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function generate() {
    setError(null);
    setStarting(true);
    try {
      const items = candidates
        .filter(c => selected.has(idOf(c)))
        .map(c => ({ huntId: c.huntId, key: c.key }));

      const res = await fetch("/api/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const json = await res.json();

      if (!json.ok) {
        setError(json.error ?? "Could not start generating.");
        return;
      }
      setJob({ status: "running", stage: "Starting up", progress: 2, drafted: 0 });
      setSelected(new Set());
    } catch {
      setError("Could not reach the server.");
    } finally {
      setStarting(false);
    }
  }

  // ------------------------------------------------------------- running
  if (running) {
    return (
      <section className="card p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--foreground)]">
            <Spinner className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-tight">Generating your emails</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              This runs in the background — you can leave this page or close the tab.
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
          aria-label="Generation progress"
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

  if (!candidates.length) {
    return (
      <section className="card flex flex-col items-center gap-4 p-10 text-center">
        <Icon name="globe-crawl" className="h-8 w-8 text-[var(--muted)]" />
        <p className="max-w-sm text-sm text-[var(--muted)]">
          Nothing to write to yet. Run a hunt from the dashboard and the companies it finds will
          appear here.
        </p>
      </section>
    );
  }

  const withEmail = candidates.filter(c => c.email).length;

  return (
    <section className="card p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Generate emails</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {candidates.length} companies found across your hunts · {withEmail} with a verified
            address
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSelected(new Set(visible.map(idOf)))}
            className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--subtle)]"
          >
            Select shown
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

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {FILTERS.map(f => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`rounded-full border px-3.5 py-1.5 text-xs transition-colors ${
              filter === f.id ? "is-selected" : "border-[var(--line)] hover:bg-[var(--subtle)]"
            }`}
          >
            {f.label}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search company or role…"
          className="ml-auto w-full max-w-xs rounded-xl border border-[var(--line)] bg-[var(--background)] px-4 py-2 text-sm outline-none transition-colors focus:border-[var(--foreground)]"
        />
      </div>

      <ul className="mt-5 grid gap-2 lg:grid-cols-2">
        {visible.map(c => {
          const id = idOf(c);
          const on = selected.has(id);

          return (
            <li key={id}>
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                  on ? "border-[var(--foreground)]" : "border-[var(--line)] hover:bg-[var(--subtle)]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(c)}
                  className="mt-1 shrink-0 accent-[var(--foreground)]"
                />

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{c.company}</span>
                    {c.sent ? (
                      <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                        sent
                      </span>
                    ) : c.drafted ? (
                      <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                        drafted
                      </span>
                    ) : null}
                  </span>

                  {c.roleTitle && (
                    <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
                      {[c.roleTitle, c.roleType, c.location].filter(Boolean).join(" · ")}
                    </span>
                  )}

                  <span className="mt-1.5 block truncate text-xs">
                    {c.email ? (
                      <span className="font-medium">{c.email}</span>
                    ) : c.ats ? (
                      <span className="text-[var(--muted)]">Applies via {c.ats}</span>
                    ) : (
                      <span className="text-[var(--muted)]">No address found</span>
                    )}
                  </span>

                  {c.website && (
                    <a
                      href={c.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="link-underline mt-1 block truncate text-xs text-[var(--muted)]"
                    >
                      {c.domain}
                    </a>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {!visible.length && (
        <p className="mt-6 text-sm text-[var(--muted)]">Nothing matches that filter.</p>
      )}

      {error && (
        <p role="alert" className="mt-5 rounded-xl border border-[var(--foreground)] px-4 py-3 text-sm">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={generate}
        disabled={!selected.size}
        className="btn-accent mt-6 inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-sm font-medium disabled:opacity-40"
      >
        <Icon name="draft-ai" className="h-4 w-4" />
        Generate {selected.size || "no"} email{selected.size === 1 ? "" : "s"}
      </button>

      {selected.size > 25 && (
        <p className="mt-2 text-xs text-[var(--muted)]">
          Up to 25 are written per run — the rest stay selected for the next one.
        </p>
      )}
    </section>
  );
}
