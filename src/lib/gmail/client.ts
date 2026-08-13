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

interface RawMessage {
  id: string;
  threadId: string;
  snippet: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: {
    headers?: { name: string; value: string }[];
    mimeType?: string;
    body?: { data?: string };
    parts?: RawMessage["payload"][];
  };
}

const header = (msg: RawMessage, name: string): string =>
  msg.payload?.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

/** Gmail encodes bodies as base64url, which Buffer understands directly. */
function decodeBody(data?: string): string {
  if (!data) return "";
  return Buffer.from(data, "base64url").toString("utf8");
}

/** Walks the MIME tree for the best plain-text body available. */
function extractBody(payload: RawMessage["payload"]): string {
  if (!payload) return "";

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBody(payload.body.data);
  }

  for (const part of payload.parts ?? []) {
    const found = extractBody(part);
    if (found) return found;
  }

  // Fall back to HTML with the tags stripped rather than showing nothing.
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return decodeBody(payload.body.data)
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  return "";
}

function toMessage(raw: RawMessage, includeBody = false): MailMessage {
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
    ...(includeBody ? { body: extractBody(raw.payload) } : {}),
  };
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
