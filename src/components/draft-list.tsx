"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";

export interface DraftView {
  key: string;
  company: string;
  roleTitle?: string;
  to?: string;
  applyUrl?: string;
  subject: string;
  body: string;
  rationale: string;
  warnings: string[];
}

/** Opens the user's mail client with the draft pre-filled. */
function mailtoHref(draft: DraftView): string {
  const params = new URLSearchParams({ subject: draft.subject, body: draft.body });
  return `mailto:${draft.to ?? ""}?${params}`;
}

export function DraftList({ drafts }: { drafts: DraftView[] }) {
  const [open, setOpen] = useState<string | null>(drafts[0]?.key ?? null);
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(draft: DraftView) {
    await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
    setCopied(draft.key);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <ul className="space-y-4">
      {drafts.map(draft => {
        const expanded = open === draft.key;

        return (
          <li key={draft.key} className="card overflow-hidden">
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : draft.key)}
              aria-expanded={expanded}
              className="flex w-full items-start justify-between gap-4 p-5 text-left transition-colors hover:bg-[var(--subtle)]"
            >
              <span className="min-w-0">
                <span className="block font-semibold tracking-tight">{draft.company}</span>
                <span className="mt-0.5 block truncate text-sm text-[var(--muted)]">
                  {draft.subject || "Draft failed"}
                </span>
                <span className="mt-1 block truncate text-xs text-[var(--muted)]">
                  {draft.to ? `To ${draft.to}` : draft.applyUrl ? "Apply via careers page" : "No recipient"}
                </span>
              </span>
              <span className="shrink-0 text-[var(--muted)]">{expanded ? "−" : "+"}</span>
            </button>

            {expanded && (
              <div className="border-t border-[var(--line)] p-5">
                {draft.body ? (
                  <>
                    <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Subject</p>
                    <p className="mt-1 font-medium">{draft.subject}</p>

                    <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed">
                      {draft.body}
                    </pre>

                    <div className="mt-5 flex flex-wrap gap-2">
                      {/* mailto rather than a send button: nothing leaves the app
                          without the user pressing send in their own client. */}
                      <a
                        href={mailtoHref(draft)}
                        className="btn-accent inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium"
                      >
                        <Icon name="send" className="h-4 w-4" />
                        Open in mail app
                      </a>
                      <button
                        type="button"
                        onClick={() => copy(draft)}
                        className="rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--subtle)]"
                      >
                        {copied === draft.key ? "Copied" : "Copy"}
                      </button>
                      {draft.applyUrl && (
                        <a
                          href={draft.applyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--subtle)]"
                        >
                          Careers page
                        </a>
                      )}
                    </div>

                    {draft.rationale && (
                      <div className="mt-5 border-t border-[var(--line)] pt-4">
                        <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                          Why it was written this way
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
                          {draft.rationale}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-[var(--muted)]">This draft could not be written.</p>
                )}

                {!!draft.warnings.length && (
                  <div className="mt-5 rounded-xl border border-[var(--line-strong)] bg-[var(--subtle)] p-4">
                    <p className="text-xs font-medium uppercase tracking-wide">Check before sending</p>
                    <ul className="mt-2 space-y-1.5 text-sm text-[var(--muted)]">
                      {draft.warnings.map(w => (
                        <li key={w} className="flex gap-2">
                          <span aria-hidden="true">•</span>
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
