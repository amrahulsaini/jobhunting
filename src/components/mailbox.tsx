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
}

/** Gmail search shortcuts, so the useful views are one click away. */
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
  const [openLoading, setOpenLoading] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async (query: string) => {
    // Guards against an older, slower request overwriting a newer result.
    const id = ++requestId.current;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/gmail/messages?q=${encodeURIComponent(query)}&limit=25`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (id !== requestId.current) return;

      if (!json.ok) {
        setError(json.error ?? "Could not load your mail.");
        setNeedsReconnect(Boolean(json.needsReconnect));
        setMessages([]);
        return;
      }
      setMessages(json.messages ?? []);
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
    const timer = setTimeout(() => load(query), search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [filter, search, load]);

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
    <div className="grid h-[calc(100vh-15rem)] min-h-[30rem] gap-5 lg:grid-cols-[1.1fr_1.4fr]">
      {/* ------------------------------------------------------------ list */}
      <section className="card flex min-h-0 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-[var(--line)] p-4">
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search mail…"
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--background)] px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--foreground)]"
            />
            {loading && <Spinner className="h-4 w-4 shrink-0" />}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {FILTERS.map(f => (
              <button
                key={f.label}
                type="button"
                onClick={() => setFilter(f.id)}
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
                    <div className="flex items-baseline justify-between gap-3">
                      <span className={`truncate text-sm ${m.unread ? "font-semibold" : ""}`}>
                        {displayName(m.from)}
                      </span>
                      <span className="shrink-0 text-xs text-[var(--muted)]">
                        {new Date(m.date).toLocaleDateString()}
                      </span>
                    </div>
                    <p className={`mt-1 truncate text-sm ${m.unread ? "font-medium" : ""}`}>
                      {m.subject}
                    </p>
                    <p className="mt-1 truncate text-xs text-[var(--muted)]">{m.snippet}</p>
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
            <h2 className="text-lg font-semibold tracking-tight">{open.subject}</h2>
            <div className="mt-2 space-y-0.5 text-sm text-[var(--muted)]">
              <p className="break-all">From {open.from}</p>
              {open.to && <p className="break-all">To {open.to}</p>}
              <p>{new Date(open.date).toLocaleString()}</p>
            </div>

            <div className="mt-5 border-t border-[var(--line)] pt-5">
              {openLoading ? (
                <p className="flex items-center gap-2 text-sm text-[var(--muted)]">
                  <Spinner className="h-4 w-4" /> Loading message…
                </p>
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
