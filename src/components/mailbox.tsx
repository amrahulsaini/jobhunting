"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { Spinner } from "@/components/hunter-progress";

interface MailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
  labels: string[];
  body?: string;
  html?: string;
  cc?: string;
  replyTo?: string;
  attachments?: { filename: string; mimeType: string; size: number; attachmentId: string }[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/** "Aman Saini <a@x.com>" -> "a@x.com" */
function addressOf(value: string): string {
  return value.match(/<([^>]+)>/)?.[1] ?? value.trim();
}

/** Two-letter monogram for the sender avatar. */
function initials(value: string): string {
  const name = displayName(value).replace(/[^A-Za-z ]/g, "").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Gmail search shortcuts, so the useful views are one click away. */
const PAGE_SIZE = 25;

const FILTERS = [
  { id: "", label: "All mail" },
  { id: "is:unread", label: "Unread" },
  { id: "in:sent", label: "Sent" },
  // The outreach view: replies to mail you sent, which is what matters here.
  { id: "in:inbox -category:promotions -category:social", label: "Primary" },
];

/** "Aman Saini <aman@x.com>" -> "Aman Saini" */
function displayName(address: string): string {
  const match = address.match(/^\s*"?([^"<]+?)"?\s*</);
  return (match?.[1] ?? address.replace(/[<>]/g, "")).trim();
}

export function Mailbox({ connectedAs }: { connectedAs?: string }) {
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [open, setOpen] = useState<MailMessage | null>(null);
  /**
   * Gmail only hands out a forward token, so going back means remembering the
   * tokens already used. The stack holds the token that opened each page;
   * index 0 is the first page, which has no token.
   */
  const [tokens, setTokens] = useState<(string | undefined)[]>([undefined]);
  const [page, setPage] = useState(0);
  const [nextToken, setNextToken] = useState<string | undefined>();
  const [estimate, setEstimate] = useState(0);
  const [openLoading, setOpenLoading] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async (query: string, pageToken?: string) => {
    // Guards against an older, slower request overwriting a newer result.
    const id = ++requestId.current;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ q: query, limit: String(PAGE_SIZE) });
      if (pageToken) params.set("pageToken", pageToken);

      const res = await fetch(`/api/gmail/messages?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (id !== requestId.current) return;

      if (!json.ok) {
        setError(json.error ?? "Could not load your mail.");
        setNeedsReconnect(Boolean(json.needsReconnect));
        setMessages([]);
        return;
      }
      setMessages(json.messages ?? []);
      setNextToken(json.nextPageToken);
      setEstimate(json.estimate ?? 0);
    } catch {
      if (id === requestId.current) setError("Could not reach the server.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  /**
   * Debounced, so typing a search does not fire a Gmail request per keystroke —
   * the API rate-limits quickly and each call costs a round trip. Running the
   * load from a timer also keeps state updates out of the effect body.
   */
  useEffect(() => {
    const query = [filter, search.trim()].filter(Boolean).join(" ");
    const timer = setTimeout(() => load(query, tokens[page]), search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [filter, search, page, tokens, load]);

  /** A new filter or search invalidates the token stack entirely. */
  function resetPaging() {
    setTokens([undefined]);
    setPage(0);
    setOpen(null);
  }

  const from = estimate ? page * PAGE_SIZE + 1 : 0;
  const to = page * PAGE_SIZE + messages.length;

  function goNext() {
    if (!nextToken) return;
    setTokens(prev => (prev[page + 1] ? prev : [...prev.slice(0, page + 1), nextToken]));
    setPage(p => p + 1);
    setOpen(null);
  }

  function goBack() {
    if (page === 0) return;
    setPage(p => p - 1);
    setOpen(null);
  }

  async function openMessage(message: MailMessage) {
    setOpen(message);
    if (message.body) return;

    setOpenLoading(true);
    try {
      const res = await fetch(`/api/gmail/messages?id=${message.id}`, { cache: "no-store" });
      const json = await res.json();
      if (json.ok) setOpen(json.message);
    } finally {
      setOpenLoading(false);
    }
  }

  return (
    <div className="grid h-[calc(100dvh-16rem)] min-h-[26rem] gap-5 lg:h-[calc(100dvh-13rem)] lg:grid-cols-[1.1fr_1.4fr]">
      {/* ------------------------------------------------------------ list */}
      <section className="card flex min-h-0 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-[var(--line)] p-4">
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); resetPaging(); }}
              placeholder="Search mail…"
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--background)] px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--foreground)]"
            />
            {loading && <Spinner className="h-4 w-4 shrink-0" />}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-[var(--muted)] tabular-nums">
              {messages.length ? `${from}–${to}${estimate > to ? ` of ${estimate}` : ""}` : "—"}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={goBack}
                disabled={page === 0 || loading}
                aria-label="Newer"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line)] text-sm transition-colors hover:bg-[var(--subtle)] disabled:opacity-30"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={!nextToken || loading}
                aria-label="Older"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line)] text-sm transition-colors hover:bg-[var(--subtle)] disabled:opacity-30"
              >
                ›
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {FILTERS.map(f => (
              <button
                key={f.label}
                type="button"
                onClick={() => { setFilter(f.id); resetPaging(); }}
                aria-pressed={filter === f.id}
                className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  filter === f.id ? "is-selected" : "border-[var(--line)] hover:bg-[var(--subtle)]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {error ? (
            <div className="p-6">
              <p className="text-sm">{error}</p>
              {needsReconnect && (
                <a
                  href="/api/gmail/connect"
                  className="mt-4 inline-flex rounded-xl btn-accent px-4 py-2.5 text-sm font-medium"
                >
                  Reconnect Gmail
                </a>
              )}
            </div>
          ) : !messages.length && !loading ? (
            <p className="p-6 text-sm text-[var(--muted)]">No messages match that.</p>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {messages.map(m => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => openMessage(m)}
                    className={`w-full px-5 py-4 text-left transition-colors hover:bg-[var(--subtle)] ${
                      open?.id === m.id ? "bg-[var(--subtle)]" : ""
                    }`}
                  >
                    <div className="flex gap-3">
                      <span
                        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                          m.unread ? "border-[var(--foreground)]" : "border-[var(--line)] text-[var(--muted)]"
                        }`}
                      >
                        {initials(m.from)}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className={`truncate text-sm ${m.unread ? "font-semibold" : ""}`}>
                            {displayName(m.from)}
                          </span>
                          <span className="shrink-0 text-xs text-[var(--muted)]">
                            {new Date(m.date).toLocaleDateString()}
                          </span>
                        </span>
                        <span className={`mt-0.5 block truncate text-sm ${m.unread ? "font-medium" : ""}`}>
                          {m.subject}
                        </span>
                        <span className="mt-1 block truncate text-xs text-[var(--muted)]">{m.snippet}</span>
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* --------------------------------------------------------- reader */}
      <section className="card min-h-0 overflow-y-auto overscroll-contain p-6">
        {open ? (
          <article>
            <h2 className="text-xl font-semibold tracking-tight">{open.subject}</h2>

            {/* Sender block, laid out like a mail client rather than a list of
                raw headers. */}
            <div className="mt-4 flex items-start gap-3 border-b border-[var(--line)] pb-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--line)] text-xs font-semibold">
                {initials(open.from)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">{displayName(open.from)}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {new Date(open.date).toLocaleString()}
                  </p>
                </div>
                <p className="truncate text-sm text-[var(--muted)]">{addressOf(open.from)}</p>
                {open.to && (
                  <p className="mt-1 truncate text-xs text-[var(--muted)]">to {open.to}</p>
                )}
                {open.cc && (
                  <p className="truncate text-xs text-[var(--muted)]">cc {open.cc}</p>
                )}
              </div>
            </div>

            {!!open.attachments?.length && (
              <div className="mt-5">
                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  {open.attachments.length} attachment{open.attachments.length === 1 ? "" : "s"}
                </p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {open.attachments.map(a => (
                    <li key={a.attachmentId}>
                      <a
                        href={`/api/gmail/attachment?message=${open.id}&id=${a.attachmentId}&name=${encodeURIComponent(a.filename)}`}
                        className="flex items-center gap-2.5 rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm transition-colors hover:bg-[var(--subtle)]"
                      >
                        <Icon name="resume-scan" className="h-4 w-4 shrink-0" />
                        <span className="min-w-0">
                          <span className="block max-w-[14rem] truncate">{a.filename}</span>
                          <span className="block text-xs text-[var(--muted)]">
                            {formatBytes(a.size)}
                          </span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5 border-t border-[var(--line)] pt-5">
              {openLoading ? (
                <p className="flex items-center gap-2 text-sm text-[var(--muted)]">
                  <Spinner className="h-4 w-4" /> Loading message…
                </p>
              ) : open.html ? (
                // Sanitised server-side: scripts, styles, iframes, inline event
                // handlers and remote tracking images are stripped before this.
                <div
                  className="mail-body text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: open.html }}
                />
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                  {open.body || open.snippet}
                </pre>
              )}
            </div>

            <a
              href={`https://mail.google.com/mail/u/0/#inbox/${open.threadId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--subtle)]"
            >
              Open in Gmail
            </a>
          </article>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Icon name="mail-search" className="h-8 w-8 text-[var(--muted)]" />
            <p className="text-sm text-[var(--muted)]">
              {connectedAs ? `Reading ${connectedAs}` : "Pick a message to read it here."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
