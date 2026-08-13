import type { ObjectId } from "mongodb";
import { accessTokenFor } from "./oauth";

/**
 * Sends mail through the Gmail API.
 *
 * Gmail takes a complete RFC 2822 message, base64url encoded, so the MIME
 * envelope is assembled here rather than by a mail library — one dependency
 * fewer for a format this stable.
 */

export interface Attachment {
  filename: string;
  mimeType: string;
  content: Buffer;
}

/**
 * Encodes a header value that may contain non-ASCII.
 *
 * A subject with an accent or an em dash is otherwise mangled in transit, so
 * anything outside ASCII is sent as an RFC 2047 encoded word.
 */
function encodeHeader(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/** Splits base64 into 76-character lines, as the MIME spec requires. */
function wrap(base64: string): string {
  return base64.replace(/(.{76})/g, "$1\r\n");
}

export function buildMime({
  to,
  from,
  subject,
  body,
  attachments = [],
}: {
  to: string;
  from?: string;
  subject: string;
  body: string;
  attachments?: Attachment[];
}): string {
  const boundary = `jh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

  const headers = [
    `To: ${to}`,
    from ? `From: ${from}` : "",
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
  ].filter(Boolean);

  if (!attachments.length) {
    return [
      ...headers,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      wrap(Buffer.from(body, "utf8").toString("base64")),
    ].join("\r\n");
  }

  const parts = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap(Buffer.from(body, "utf8").toString("base64")),
  ];

  for (const file of attachments) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${file.mimeType}; name="${file.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${file.filename}"`,
      "",
      wrap(file.content.toString("base64"))
    );
  }

  parts.push(`--${boundary}--`, "");
  return parts.join("\r\n");
}

export interface SendResult {
  id: string;
  threadId: string;
}

export async function sendMail(
  userId: ObjectId,
  message: Parameters<typeof buildMime>[0]
): Promise<SendResult> {
  const token = await accessTokenFor(userId);

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // base64url: Gmail rejects standard base64 padding here.
      raw: Buffer.from(buildMime(message), "utf8").toString("base64url"),
    }),
    signal: AbortSignal.timeout(30_000),
  });

  const json = await res.json();
  if (!res.ok) {
    const detail = json?.error?.message ?? `Gmail send failed (${res.status})`;
    if (res.status === 401 || res.status === 403) {
      throw new Error(`${detail}. Reconnect Gmail and try again.`);
    }
    throw new Error(detail);
  }

  return { id: json.id, threadId: json.threadId };
}
