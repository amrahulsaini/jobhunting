"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { Spinner } from "@/components/hunter-progress";
import { MATCH_COUNTS, ROLE_TYPES, type CountryScope, type RoleType } from "@/lib/hunting/types";

export interface HuntJobState {
  status: "running" | "done" | "failed";
  stage: string;
  progress: number;
  found: number;
  huntId?: string;
  error?: string;
}

const FIELD =
  "w-full rounded-xl border border-[var(--line)] bg-[var(--background)] px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--foreground)]";

export function HuntLauncher({
  countries,
  ownCountry,
  availableRoles,
  job: initialJob,
}: {
  countries: { code: string; name: string }[];
  ownCountry?: string;
  /** Roles from the profile and briefing, offered as choices. */
  availableRoles: string[];
  job: HuntJobState | null;
}) {
  const router = useRouter();

  const [scope, setScope] = useState<CountryScope>(ownCountry ? "own" : "global");
  const [picked, setPicked] = useState<string[]>([]);
  const [roleTypes, setRoleTypes] = useState<RoleType[]>(["full-time"]);
  const [matches, setMatches] = useState<number>(5);
  const [available, setAvailable] = useState<string[]>(availableRoles);
  const [roles, setRoles] = useState<string[]>(availableRoles.slice(0, 3));
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const [job, setJob] = useState<HuntJobState | null>(initialJob);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const running = job?.status === "running" || starting;

  // Same pattern as the briefing: the job lives server-side, so poll it.
  useEffect(() => {
    if (job?.status !== "running") return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/hunt", { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        if (json.job) {
          setJob(json.job);
          if (json.job.status === "done" && json.job.huntId) {
            router.push(`/hunts/${json.job.huntId}`);
            return;
          }
        }
      } catch {
        /* a dropped poll is not fatal */
      }
      if (!cancelled) timer.current = setTimeout(poll, 2500);
    };

    timer.current = setTimeout(poll, 1500);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [job?.status, router]);

  async function start() {
    setError(null);
    setStarting(true);
    try {
      const res = await fetch("/api/hunt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          countries: picked,
          roleTypes,
          matches,
          roles,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Could not start the hunt.");
        return;
      }
      setJob({ status: "running", stage: "Starting up", progress: 2, found: 0 });
    } catch {
      setError("Could not reach the server.");
    } finally {
      setStarting(false);
    }
  }

  const toggleRole = (r: string) =>
    setRoles(prev => (prev.includes(r) ? prev.filter(v => v !== r) : prev.length < 6 ? [...prev, r] : prev));

  function addCustom() {
    const value = custom.trim();
    if (!value || roles.length >= 6) return;
    // Case-insensitive: avoid the same role appearing twice in different casing.
    if (!available.some(r => r.toLowerCase() === value.toLowerCase())) setAvailable(prev => [...prev, value]);
    if (!roles.some(r => r.toLowerCase() === value.toLowerCase())) setRoles(prev => [...prev, value]);
    setCustom("");
  }

  const toggleType = (id: RoleType) =>
    setRoleTypes(prev => (prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]));

  // ------------------------------------------------------------- running
  if (running) {
    return (
      <section className="card p-7 sm:p-10">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--foreground)]">
            <Spinner className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-tight">Hunting</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Searching Google, then opening each company&apos;s site to find a real contact.
              This keeps running if you close the tab.
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
          aria-label="Hunt progress"
          className="mt-7 h-2 w-full overflow-hidden rounded-full bg-[var(--subtle)]"
        >
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-700 ease-out"
            style={{ width: `${Math.max(2, Math.min(100, job?.progress ?? 2))}%` }}
          />
        </div>

        <p className="mt-4 flex items-center gap-2 text-sm text-[var(--muted)]">
          <Spinner className="h-3.5 w-3.5" />
          {job?.stage ?? "Starting up"}
        </p>
      </section>
    );
  }

  // -------------------------------------------------------------- failed
  if (job?.status === "failed") {
    return (
      <section className="card p-7">
        <h2 className="text-lg font-semibold tracking-tight">The hunt could not finish</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">{job.error}</p>
        <button
          type="button"
          onClick={() => setJob(null)}
          className="mt-6 rounded-xl border border-[var(--line)] px-5 py-3 text-sm font-medium transition-colors hover:bg-[var(--subtle)]"
        >
          Try again
        </button>
      </section>
    );
  }

  // --------------------------------------------------------------- form
  return (
    <section className="card p-6 sm:p-8">
      <h2 className="text-lg font-semibold tracking-tight">Start hunting</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Hunter searches Google for companies hiring you, opens each one&apos;s website, and
        reads their careers page for a published contact.
      </p>

      <div className="mt-7 grid gap-7 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium">Where should we look?</h3>
          <div className="mt-3 space-y-2">
            {[
              { id: "own" as const, label: ownCountry ? `My country — ${ownCountry}` : "My country", disabled: !ownCountry },
              { id: "specific" as const, label: "Specific countries", disabled: false },
              { id: "global" as const, label: "Anywhere in the world", disabled: false },
            ].map(option => (
              <label
                key={option.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors ${
                  scope === option.id
                    ? "border-[var(--foreground)]"
                    : "border-[var(--line)] hover:bg-[var(--subtle)]"
                } ${option.disabled ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <input
                  type="radio"
                  name="scope"
                  checked={scope === option.id}
                  disabled={option.disabled}
                  onChange={() => setScope(option.id)}
                  className="accent-[var(--foreground)]"
                />
                {option.label}
              </label>
            ))}
          </div>

          {scope === "specific" && (
            <div className="mt-4">
              <label htmlFor="countries" className="mb-1.5 block text-sm font-medium">
                Countries
              </label>
              <select
                id="countries"
                multiple
                size={6}
                value={picked}
                onChange={e =>
                  setPicked([...e.target.selectedOptions].map(o => o.value).slice(0, 10))
                }
                className={FIELD}
              >
                {countries.map(c => (
                  <option key={c.code} value={c.name}>{c.name}</option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-[var(--muted)]">
                Hold Ctrl or Cmd to pick several. {picked.length} selected.
              </p>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-medium">Role type</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {ROLE_TYPES.map(type => {
              const on = roleTypes.includes(type.id);
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => toggleType(type.id)}
                  aria-pressed={on}
                  className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                    on
                      ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]"
                      : "border-[var(--line)] hover:bg-[var(--subtle)]"
                  }`}
                >
                  {type.label}
                </button>
              );
            })}
          </div>

          <h3 className="mt-7 text-sm font-medium">How many companies?</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {MATCH_COUNTS.map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setMatches(n)}
                aria-pressed={matches === n}
                className={`min-w-[4rem] rounded-xl border px-4 py-2.5 text-sm transition-colors ${
                  matches === n
                    ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]"
                    : "border-[var(--line)] hover:bg-[var(--subtle)]"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Each one is researched properly — website, careers page, contact. More takes longer.
          </p>

        </div>
      </div>

      {/* Every role we know about, so a wider selection means more searches. */}
      <div className="mt-7 border-t border-[var(--line)] pt-7">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="text-sm font-medium">Roles to search for</h3>
          <p className="text-xs text-[var(--muted)]">
            {roles.length} selected · each runs its own Google search
          </p>
        </div>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Taken from your resume and Hunter&apos;s briefing. More roles means more
          queries and a wider net — up to 6.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {available.map(r => {
            const on = roles.includes(r);
            const full = !on && roles.length >= 6;
            return (
              <button
                key={r}
                type="button"
                disabled={full}
                onClick={() => toggleRole(r)}
                aria-pressed={on}
                className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                  on
                    ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]"
                    : full
                      ? "cursor-not-allowed border-[var(--line)] opacity-40"
                      : "border-[var(--line)] hover:bg-[var(--subtle)]"
                }`}
              >
                {r}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <input
            value={custom}
            onChange={e => setCustom(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="Add another role…"
            className={`${FIELD} sm:max-w-xs`}
          />
          <button
            type="button"
            onClick={addCustom}
            disabled={!custom.trim() || roles.length >= 6}
            className="rounded-xl border border-[var(--line)] px-5 py-3 text-sm font-medium transition-colors hover:bg-[var(--subtle)] disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-6 rounded-xl border border-[var(--foreground)] px-4 py-3 text-sm">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={start}
        className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--foreground)] px-6 py-4 text-sm font-medium text-[var(--background)] shadow-[var(--shadow-md)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg)] sm:w-auto sm:px-8"
      >
        <Icon name="hunter" className="h-4 w-4" />
        Start hunting
      </button>
    </section>
  );
}
