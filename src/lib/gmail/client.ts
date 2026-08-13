import type { ObjectId } from "mongodb";
import { accessTokenFor } from "./oauth";

/**
 * Reads mail through the Gmail REST API.
 *
 * Listing returns ids only, so each message needs a second call. Those are
 * fetched with bounded concurrency and with `format=metadata` where possible,
 * which returns headers without dragging down every attachment.
 */

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface MailAttachment {
  filename: string;
  mimeType: string;
  /** Bytes, as Gmail reports them. */
  size: number;
  /** Needed to fetch the bytes; only valid for this message. */
  attachmentId: string;
}

export interface MailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
  labels: string[];
  /** Full plain-text body, only populated when a single message is opened. */
  body?: string;
}

async function api<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const detail = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new Error("Gmail access was refused. Reconnect the account.");
    }
    throw new Error(`Gmail API ${res.status}: ${detail.slice(0, 160)}`);
  }
  return res.json() as Promise<T>;
}

interface RawPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: RawPart[];
}

interface RawMessage {
  id: string;
  threadId: string;
  snippet: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: RawPart;
}

const header = (msg: RawMessage, name: string): string =>
  msg.payload?.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

/** Gmail encodes bodies as base64url, which Buffer understands directly. */
function decodeBody(data?: string): string {
  if (!data) return "";
  return Buffer.from(data, "base64url").toString("utf8");
}

/** Walks the MIME tree collecting the text body, the HTML body and attachments. */
function walk(part: RawPart | undefined, out: {
  text: string;
  html: string;
  attachments: MailAttachment[];
}): void {
  if (!part) return;

  // A part with a filename and an attachmentId is a real attachment. Inline
  // images also carry filenames, but they still belong in the list — a user
  // looking for "the file they sent" should find it either way.
  if (part.filename && part.body?.attachmentId) {
    out.attachments.push({
      filename: part.filename,
      mimeType: part.mimeType ?? "application/octet-stream",
      size: part.body.size ?? 0,
      attachmentId: part.body.attachmentId,
    });
  }

  if (part.mimeType === "text/plain" && part.body?.data && !part.filename) {
    out.text ||= decodeBody(part.body.data);
  }
  if (part.mimeType === "text/html" && part.body?.data && !part.filename) {
    out.html ||= decodeBody(part.body.data);
  }

  for (const child of part.parts ?? []) walk(child, out);
}

/**
 * Strips HTML mail down to something safe to render.
 *
 * Mail is untrusted input, so scripts, styles, iframes, event handlers and
 * remote images are removed rather than sanitised in place. Remote images are
 * dropped specifically because they act as read-receipt trackers.
 */
function sanitiseHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<(iframe|object|embed|form|link|meta|base)\b[\s\S]*?>/gi, "")
    .replace(/<\/(iframe|object|embed|form)>/gi, "")
    // Inline event handlers and javascript: URLs.
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "")
    // Remote images are tracking pixels as often as they are content.
    .replace(/<img\b[^>]*>/gi, "")
    .trim();
}

function toMessage(raw: RawMessage, includeBody = false): MailMessage {
  const parsed = { text: "", html: "", attachments: [] as MailAttachment[] };
  if (includeBody) walk(raw.payload, parsed);

  return {
    id: raw.id,
    threadId: raw.threadId,
    from: header(raw, "From"),
    to: header(raw, "To"),
    subject: header(raw, "Subject") || "(no subject)",
    snippet: raw.snippet ?? "",
    date: raw.internalDate
      ? new Date(Number(raw.internalDate)).toISOString()
      : header(raw, "Date"),
    unread: (raw.labelIds ?? []).includes("UNREAD"),
    labels: raw.labelIds ?? [],
    ...(includeBody
      ? {
          body: parsed.text,
          html: parsed.html ? sanitiseHtml(parsed.html) : undefined,
          attachments: parsed.attachments,
          cc: header(raw, "Cc"),
          replyTo: header(raw, "Reply-To"),
        }
      : {}),
  };
}

/** Streams one attachment's bytes. Gmail returns them base64url encoded. */
export async function getAttachment(
  userId: ObjectId,
  messageId: string,
  attachmentId: string
): Promise<Buffer> {
  const token = await accessTokenFor(userId);
  const data = await api<{ data?: string }>(
    token,
    `/messages/${messageId}/attachments/${attachmentId}`
  );
  return Buffer.from(data.data ?? "", "base64url");
}

export interface MailPage {
  messages: MailMessage[];
  nextPageToken?: string;
  estimate: number;
}

export async function listMessages(
  userId: ObjectId,
  { query = "", limit = 25, pageToken }: { query?: string; limit?: number; pageToken?: string } = {}
): Promise<MailPage> {
  const token = await accessTokenFor(userId);

  const params = new URLSearchParams({ maxResults: String(Math.min(limit, 50)) });
  if (query) params.set("q", query);
  if (pageToken) params.set("pageToken", pageToken);

  const list = await api<{
    messages?: { id: string }[];
    nextPageToken?: string;
    resultSizeEstimate?: number;
  }>(token, `/messages?${params}`);

  const ids = (list.messages ?? []).map(m => m.id);
  const messages: MailMessage[] = [];

  // Bounded concurrency: Gmail rate-limits hard on parallel reads.
  let cursor = 0;
  await Promise.all(
    Array.from({ length: 5 }, async () => {
      while (cursor < ids.length) {
        const id = ids[cursor++];
        try {
          const raw = await api<RawMessage>(
            token,
            `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`
          );
          messages.push(toMessage(raw));
        } catch {
          // One unreadable message should not empty the whole inbox view.
        }
      }
    })
  );

  // Concurrency loses the original order, so restore newest-first.
  messages.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  return {
    messages,
    nextPageToken: list.nextPageToken,
    estimate: list.resultSizeEstimate ?? messages.length,
  };
}

export async function getMessage(userId: ObjectId, id: string): Promise<MailMessage> {
  const token = await accessTokenFor(userId);
  const raw = await api<RawMessage>(token, `/messages/${id}?format=full`);
  return toMessage(raw, true);
}
