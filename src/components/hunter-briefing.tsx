"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { ConfirmButton } from "@/components/confirm-button";

export interface Briefing {
  headline?: string;
  summary: string;
  technicalDepth?: string;
  projectAnalysis?: {
    name: string; whatItIs: string; technical: string; evidence: string; signal: string;
  }[];
  strengths: string[];
  differentiators?: string[];
  gaps: string[];
  positioning: string;
  suggestedRoles: string[];
  targetCompanies?: string[];
  searchKeywords?: string[];
  sourcesReviewed: string[];
  sourcesUnreachable?: string[];
  generatedAt?: string | Date;
}

function Panel({
  title,
  icon,
  children,
  className = "",
}: {
  title: string;
  icon?: React.ComponentProps<typeof Icon>["name"];
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-6 ${className}`}>
      <h2 className="flex items-center gap-2.5 text-sm font-semibold uppercase tracking-wide">
        {icon && <Icon name={icon} className="h-4 w-4" />}
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Bullets({ items, onRemove }: { items: string[]; onRemove?: (item: string) => void }) {
  return (
    <ul className="space-y-2.5 text-sm leading-relaxed text-[var(--muted)]">
      {items.map(item => (
        <li key={item} className="group/item flex items-start gap-2.5">
          <span aria-hidden="true" className="text-[var(--foreground)]">—</span>
          <span className="flex-1">{item}</span>
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(item)}
              aria-label={`Remove: ${item.slice(0, 40)}`}
              title="Remove"
              className="shrink-0 rounded px-1.5 text-[var(--muted)] opacity-0 transition-opacity hover:text-[var(--foreground)] focus-visible:opacity-100 group-hover/item:opacity-100"
            >
              ×
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function Tags({ items, onRemove }: { items: string[]; onRemove?: (item: string) => void }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map(item => (
        <li key={item} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-3 py-1 text-xs">
          {item}
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(item)}
              aria-label={`Remove ${item}`}
              className="text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
            >
              ×
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function HunterBriefing({
  briefing,
  usageDisplay,
  onEdit,
  onRerun,
}: {
  briefing: Briefing;
  usageDisplay?: string;
  onEdit: () => void;
  onRerun: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Local copy so removals feel instant.
   *
   * The list is trimmed on screen straight away and persisted in the
   * background; the server only ever accepts a subset of what it already
   * stored, so a failed save can lose an edit but can never corrupt the
   * briefing.
   */
  const [edited, setEdited] = useState<Briefing>(briefing);

  async function persist(next: Briefing) {
    setEdited(next);
    try {
      await fetch("/api/hunter/edit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strengths: next.strengths,
          differentiators: next.differentiators,
          gaps: next.gaps,
          suggestedRoles: next.suggestedRoles,
          targetCompanies: next.targetCompanies,
          searchKeywords: next.searchKeywords,
          projectAnalysis: next.projectAnalysis?.map(p => ({ name: p.name })),
        }),
      });
    } catch {
      setError("That change could not be saved.");
    }
  }

  /** Drops one entry from a list section. */
  const removeFrom = (key: keyof Briefing) => (item: string) =>
    persist({ ...edited, [key]: ((edited[key] as string[]) ?? []).filter(v => v !== item) });

  const removeProject = (name: string) =>
    persist({
      ...edited,
      projectAnalysis: (edited.projectAnalysis ?? []).filter(p => p.name !== name),
    });

  async function regenerate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hunter", { method: "POST" });
      const json = await res.json();
      if (!json.ok) setError(json.error ?? "Hunter could not run.");
      else { onRerun(); router.refresh(); }
    } catch {
      setError("Hunter could not run.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------ head */}
      <header className="card p-6 lg:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--foreground)]">
              <Icon name="hunter" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                {edited.headline ?? "Hunter briefing"}
              </h1>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Read {edited.sourcesReviewed.length}{" "}
                {edited.sourcesReviewed.length === 1 ? "source" : "sources"}
                {edited.generatedAt &&
                  ` · ${new Date(edited.generatedAt).toLocaleString()}`}
                {usageDisplay && ` · ${usageDisplay} used`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ConfirmButton
              variant="text"
              label="Delete briefing"
              onConfirm={async () => {
                await fetch("/api/hunter", { method: "DELETE" });
                router.refresh();
              }}
              className="px-4 py-2.5 text-sm"
            />
            <button
              type="button"
              onClick={onEdit}
              className="rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--subtle)]"
            >
              Edit details
            </button>
            <button
              type="button"
              onClick={regenerate}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl btn-accent px-4 py-2.5 text-sm font-medium transition-all duration-300 hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
            >
              <Icon name="hunter" className="h-4 w-4" />
              {busy ? "Starting…" : "Run briefing again"}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-[var(--foreground)] px-4 py-3 text-sm">
            {error}
          </p>
        )}
      </header>

      {/* Two columns from lg up: the narrative reads on the left, the
          scannable facts sit on the right instead of below the fold. */}
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr] xl:grid-cols-[1.8fr_1fr]">
        <div className="space-y-5">
          <Panel title="The briefing" icon="draft-ai">
            <p className="whitespace-pre-line leading-relaxed">{edited.summary}</p>
          </Panel>

          {edited.technicalDepth && (
            <Panel title="Technical depth" icon="bot-crawler">
              <p className="leading-relaxed text-[var(--muted)]">{edited.technicalDepth}</p>
            </Panel>
          )}

          {!!edited.projectAnalysis?.length && (
            <Panel title={`Projects analysed (${edited.projectAnalysis.length})`} icon="target-link">
              <div className="space-y-5">
                {edited.projectAnalysis.map(project => (
                  <article
                    key={project.name}
                    className="rounded-xl border border-[var(--line)] p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold tracking-tight">{project.name}</h3>
                      <button
                        type="button"
                        onClick={() => removeProject(project.name)}
                        aria-label={`Remove ${project.name}`}
                        title="Remove this project"
                        className="shrink-0 rounded-lg border border-[var(--line)] px-2 py-1 text-xs text-[var(--muted)] transition-colors hover:border-[var(--foreground)] hover:text-[var(--foreground)]"
                      >
                        Remove
                      </button>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed">{project.whatItIs}</p>

                    <dl className="mt-4 grid gap-4 sm:grid-cols-3">
                      {[
                        ["How it's built", project.technical],
                        ["Evidence", project.evidence],
                        ["What it signals", project.signal],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                            {label}
                          </dt>
                          <dd className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </article>
                ))}
              </div>
            </Panel>
          )}

          <Panel title="How to position you" icon="send">
            <p className="leading-relaxed text-[var(--muted)]">{edited.positioning}</p>
          </Panel>
        </div>

        <div className="space-y-5">
          {!!edited.strengths.length && (
            <Panel title="Strengths" icon="chart-up">
              <Bullets items={edited.strengths} onRemove={removeFrom("strengths")} />
            </Panel>
          )}

          {!!edited.differentiators?.length && (
            <Panel title="What sets you apart">
              <Bullets items={edited.differentiators} onRemove={removeFrom("differentiators")} />
            </Panel>
          )}

          {!!edited.gaps.length && (
            <Panel title="Gaps to close" icon="shield-lock">
              <Bullets items={edited.gaps} onRemove={removeFrom("gaps")} />
            </Panel>
          )}

          {!!edited.suggestedRoles.length && (
            <Panel title="Roles to target" icon="company">
              <Tags items={edited.suggestedRoles} onRemove={removeFrom("suggestedRoles")} />
            </Panel>
          )}

          {!!edited.targetCompanies?.length && (
            <Panel title="Companies to target">
              <Bullets items={edited.targetCompanies} onRemove={removeFrom("targetCompanies")} />
            </Panel>
          )}

          {!!edited.searchKeywords?.length && (
            <Panel title="Search terms" icon="globe-crawl">
              <Tags items={edited.searchKeywords} onRemove={removeFrom("searchKeywords")} />
            </Panel>
          )}

          <Panel title="Sources read" icon="mail-search">
            <ul className="space-y-1.5 text-xs text-[var(--muted)]">
              {edited.sourcesReviewed.map(url => (
                <li key={url} className="truncate">
                  <a href={url} target="_blank" rel="noopener noreferrer" className="link-underline">
                    {url.replace(/^https?:\/\//, "")}
                  </a>
                </li>
              ))}
            </ul>
            {!!edited.sourcesUnreachable?.length && (
              <p className="mt-3 text-xs text-[var(--muted)]">
                Could not read: {edited.sourcesUnreachable.join(", ")}
              </p>
            )}
          </Panel>
        </div>
      </div>

      {/* --------------------------------------------------- next step --- */}
      <section className="card border-dashed p-6 lg:p-7">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-dashed border-[var(--line-strong)]">
              <Icon name="globe-crawl" className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold tracking-tight">Start hunting</h2>
              <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
                Hunter knows who you are. Next it searches for the roles that match this briefing
                and drafts your outreach.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-xl border border-[var(--line)] px-5 py-3 text-sm font-medium text-[var(--muted)]"
          >
            Coming next
          </button>
        </div>
      </section>
    </div>
  );
}
