import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { encrypt, decrypt } from "@/lib/crypto";
import { users, type GmailAccount } from "@/lib/db/collections";
import type { ObjectId } from "mongodb";

/**
 * Gmail OAuth.
 *
 * Read and send are requested separately in intent but granted together, and
 * both are "sensitive" scopes in Google's terms: an unverified app can only be
 * used by accounts listed as test users on the consent screen. That is fine for
 * development and worth knowing before launch.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function gmailConfigured(): boolean {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

function credentials() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Gmail is not configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET."
    );
  }
  return { clientId, clientSecret };
}

export function redirectUri(): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/gmail/callback`;
}

/**
 * Signs the state parameter with the user's id.
 *
 * Without this, anyone could send a victim a crafted callback URL and attach
 * their own Google account to that victim's profile. The signature ties the
 * callback to the session that started it.
 */
export function makeState(userId: string): string {
  const nonce = randomBytes(8).toString("hex");
  const payload = `${userId}.${nonce}`;
  const secret = process.env.SESSION_SECRET ?? "dev-only-insecure-secret-change-me";
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function readState(state: string): string | null {
  const parts = state.split(".");
  if (parts.length !== 3) return null;

  const [userId, nonce, sig] = parts;
  const secret = process.env.SESSION_SECRET ?? "dev-only-insecure-secret-change-me";
  const expected = createHmac("sha256", secret).update(`${userId}.${nonce}`).digest("hex");

  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return userId;
}

export function authorizeUrl(state: string): string {
  const { clientId } = credentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    // offline + consent is what actually returns a refresh token; without them
    // access is lost an hour later and cannot be renewed.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  error?: string;
  error_description?: string;
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = credentials();

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });

  const json: TokenResponse = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error_description ?? json.error ?? `Token exchange failed (${res.status})`);
  }
  return json;
}

async function refresh(refreshToken: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = credentials();

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });

  const json: TokenResponse = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error_description ?? json.error ?? "Could not refresh Gmail access.");
  }
  return json;
}

/** Fetches the address of the account that just authorised. */
export async function fetchEmailAddress(accessToken: string): Promise<string | undefined> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return undefined;
  return (await res.json()).emailAddress;
}

export async function saveAccount(
  userId: ObjectId,
  tokens: TokenResponse,
  emailAddress?: string
): Promise<void> {
  const col = await users();

  const account: GmailAccount = {
    email: emailAddress,
    // Encrypted: a refresh token is a long-lived key to the whole mailbox.
    refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
    accessToken: encrypt(tokens.access_token),
    expiresAt: new Date(Date.now() + (tokens.expires_in - 60) * 1000),
    scopes: tokens.scope?.split(" ") ?? SCOPES,
    connectedAt: new Date(),
  };

  // Google only returns a refresh token on first consent, so never overwrite an
  // existing one with undefined.
  const existing = (await col.findOne({ _id: userId }))?.gmail;
  if (!account.refreshToken && existing?.refreshToken) {
    account.refreshToken = existing.refreshToken;
  }

  await col.updateOne({ _id: userId }, { $set: { gmail: account } });
}

/** Returns a usable access token, refreshing it when it has expired. */
export async function accessTokenFor(userId: ObjectId): Promise<string> {
  const col = await users();
  const account = (await col.findOne({ _id: userId }))?.gmail;

  if (!account) throw new Error("No Gmail account is connected.");

  if (account.accessToken && account.expiresAt && account.expiresAt > new Date()) {
    return decrypt(account.accessToken);
  }

  if (!account.refreshToken) {
    throw new Error("Gmail access has expired. Reconnect the account.");
  }

  const tokens = await refresh(decrypt(account.refreshToken));
  await col.updateOne(
    { _id: userId },
    {
      $set: {
        "gmail.accessToken": encrypt(tokens.access_token),
        "gmail.expiresAt": new Date(Date.now() + (tokens.expires_in - 60) * 1000),
      },
    }
  );

  return tokens.access_token;
}

export async function disconnect(userId: ObjectId): Promise<void> {
  const col = await users();
  const account = (await col.findOne({ _id: userId }))?.gmail;

  // Revoke at Google as well, so access really ends rather than just being
  // forgotten on our side.
  if (account?.refreshToken) {
    try {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: decrypt(account.refreshToken) }),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      // Revocation is best effort; the local record is removed regardless.
    }
  }

  await col.updateOne({ _id: userId }, { $unset: { gmail: "" } });
}
