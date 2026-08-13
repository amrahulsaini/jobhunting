"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

export interface OutreachDraftView {
  huntId: string;
  key: string;
  company: string;
  roleTitle?: string;
  to?: string;
  applyUrl?: string;
  subject: string;
  body: string;
  rationale: string;
  warnings: string[];
  sentAt?: string;
}

const FIELD =
  "w-full rounded-xl border border-[var(--line)] bg-[var(--background)] px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--foreground)]";

/**
 * Review, edit and send drafts.
 *
 * Editing happens in place and the edited text is what gets sent — the stored
 * draft is only a starting point. Sending is one message at a time, on an
 * explicit click, because unread bulk outreach is what gets a domain flagged.
 */
export function OutreachDrafts({
  drafts,
  canSend,
  resumeName,
}: {
  drafts: OutreachDraftView[];
  canSend: boolean;
  resumeName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { subject: string; body: string; to: string }>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const draftState = (d: OutreachDraftView) =>
    edits[d.key] ?? { subject: d.subject, body: d.body, to: d.to ?? "" };

  const update = (key: string, patch: Partial<{ subject: string; body: string; to: string }>) =>
    setEdits(prev => ({ ...prev, [key]: { ...(prev[key] ?? { subject: "", body: "", to: "" }), ...patch } }));

  async function send(d: OutreachDraftView) {
    const state = draftState(d);
    setSending(d.key);
    setError(prev => ({ ...prev, [d.key]: "" }));

    try {
      const res = await fetch("/api/outreach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          huntId: d.huntId,
          key: d.key,
          to: state.to,
          subject: state.subject,
          body: state.body,
        }),
      });
      const json = await res.json();

      if (!json.ok) {
        setError(prev => ({ ...prev, [d.key]: json.error ?? "Could not send." }));
        return;
      }
      router.refresh();
    } catch {
      setError(prev => ({ ...prev, [d.key]: "Could not reach the server." }));
    } finally {
      setSending(null);
    }
  }

  async function copy(d: OutreachDraftView) {
    const state = draftState(d);
    await navigator.clipboard.writeText(`Subject: ${state.subject}\n\n${state.body}`);
    setCopied(d.key);
    setTimeout(() => setCopied(null), 2000);
  }

  if (!drafts.length) {
    return (
      <section className="card flex flex-col items-center gap-4 p-10 text-center">
        <Icon name="draft-ai" className="h-8 w-8 text-[var(--muted)]" />
        <p className="max-w-sm text-sm text-[var(--muted)]">
          No drafts yet. Run a hunt, then pick the companies you want to write to.
        </p>
      </section>
    );
  }

  return (
    <ul className="space-y-4">
      {drafts.map(d => {
        const expanded = open === d.key;
        const state = draftState(d);
        const sent = Boolean(d.sentAt);

        return (
          <li key={`${d.huntId}:${d.key}`} className="card overflow-hidden">
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : d.key)}
              aria-expanded={expanded}
              className="flex w-full items-start justify-between gap-4 p-5 text-left transition-colors hover:bg-[var(--subtle)]"
            >
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold tracking-tight">{d.company}</span>
                  {sent && (
                    <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
                      Sent {new Date(d.sentAt!).toLocaleDateString()}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-sm text-[var(--muted)]">
                  {state.subject || "Draft failed"}
                </span>
                <span className="mt-1 block truncate text-xs text-[var(--muted)]">
                  {state.to || (d.applyUrl ? "No address — apply via careers page" : "No recipient")}
                </span>
              </span>
              <span className="shrink-0 text-[var(--muted)]">{expanded ? "−" : "+"}</span>
            </button>

            {expanded && (
              <div className="border-t border-[var(--line)] p-5">
                {state.body ? (
                  <>
                    <label className="block text-xs uppercase tracking-wide text-[var(--muted)]">
                      To
                    </label>
                    <input
                      value={state.to}
                      onChange={e => update(d.key, { to: e.target.value })}
                      disabled={sent}
                      placeholder="careers@company.com"
                      className={`${FIELD} mt-1.5`}
                    />

                    <label className="mt-4 block text-xs uppercase tracking-wide text-[var(--muted)]">
                      Subject
                    </label>
                    <input
                      value={state.subject}
                      onChange={e => update(d.key, { subject: e.target.value })}
                      disabled={sent}
                      className={`${FIELD} mt-1.5`}
                    />

                    <label className="mt-4 block text-xs uppercase tracking-wide text-[var(--muted)]">
                      Message
                    </label>
                    <textarea
                      value={state.body}
                      onChange={e => update(d.key, { body: e.target.value })}
                      disabled={sent}
                      rows={16}
                      className={`${FIELD} mt-1.5 font-sans leading-relaxed`}
                    />

                    {resumeName && !sent && (
                      <p className="mt-2 flex items-center gap-2 text-xs text-[var(--muted)]">
                        <Icon name="resume-scan" className="h-3.5 w-3.5" />
                        {resumeName} will be attached
                      </p>
                    )}

                    {error[d.key] && (
                      <p role="alert" className="mt-4 rounded-xl border border-[var(--foreground)] px-4 py-3 text-sm">
                        {error[d.key]}
                      </p>
                    )}

                    <div className="mt-5 flex flex-wrap gap-2">
                      {sent ? (
                        <span className="rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm text-[var(--muted)]">
                          Sent {new Date(d.sentAt!).toLocaleString()}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => send(d)}
                          disabled={!canSend || !state.to || sending === d.key}
                          title={
                            !canSend
                              ? "Connect Gmail to send"
                              : !state.to
                                ? "Add a recipient first"
                                : undefined
                          }
                          className="btn-accent inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium disabled:opacity-40"
                        >
                          <Icon name="send" className="h-4 w-4" />
                          {sending === d.key ? "Sending…" : "Send"}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => copy(d)}
                        className="rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--subtle)]"
                      >
                        {copied === d.key ? "Copied" : "Copy"}
                      </button>

                      {d.applyUrl && (
                        <a
                          href={d.applyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--subtle)]"
                        >
                          Careers page
                        </a>
                      )}
                    </div>

                    {d.rationale && (
                      <div className="mt-5 border-t border-[var(--line)] pt-4">
                        <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                          Why it was written this way
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
                          {d.rationale}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-[var(--muted)]">This draft could not be written.</p>
                )}

                {!!d.warnings.length && (
                  <div className="mt-5 rounded-xl border border-[var(--line-strong)] bg-[var(--subtle)] p-4">
                    <p className="text-xs font-medium uppercase tracking-wide">Check before sending</p>
                    <ul className="mt-2 space-y-1.5 text-sm text-[var(--muted)]">
                      {d.warnings.map(w => (
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
