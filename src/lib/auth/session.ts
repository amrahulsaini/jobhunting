import { cookies } from "next/headers";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { ObjectId } from "mongodb";
import { users, ensureIndexes, type UserDoc } from "@/lib/db/collections";

/**
 * Password + session handling.
 *
 * No email verification and no third-party provider — that is deliberate for
 * now. What is NOT skipped: passwords are never stored in readable form, and the
 * session cookie is signed so it cannot be edited into someone else's account.
 *
 * scrypt and HMAC both come from Node's crypto module, so there is no native
 * dependency to compile on Windows.
 */

const COOKIE = "jh_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production.");
  }
  // Dev-only fallback so the app runs before .env.local is filled in.
  return "dev-only-insecure-secret-change-me";
}

// ------------------------------------------------------------------ passwords

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  // Length check first: timingSafeEqual throws on a mismatch rather than returning false.
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

// ------------------------------------------------------------------- sessions

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

/** `<userId>.<signature>` — tampering with the id invalidates the signature. */
function serialise(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

function parse(token: string | undefined): string | null {
  if (!token) return null;
  const idx = token.lastIndexOf(".");
  if (idx < 1) return null;

  const userId = token.slice(0, idx);
  const signature = token.slice(idx + 1);
  const expected = sign(userId);

  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  return userId;
}

export async function createSession(userId: string): Promise<void> {
  (await cookies()).set(COOKIE, serialise(userId), {
    httpOnly: true, // unreadable from JavaScript, so XSS cannot steal it
    sameSite: "lax", // blocks the cookie on cross-site POSTs (CSRF)
    secure: process.env.NODE_ENV === "production", // plain http on localhost
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/** Returns the signed-in user, or null. Safe to call from any server component. */
export async function currentUser(): Promise<UserDoc | null> {
  const userId = parse((await cookies()).get(COOKIE)?.value);
  if (!userId || !ObjectId.isValid(userId)) return null;

  const col = await users();
  return col.findOne({ _id: new ObjectId(userId) });
}

// --------------------------------------------------------------- account flow

export type AuthResult = { ok: true; userId: string } | { ok: false; error: string };

const USERNAME_RX = /^[a-z0-9_-]{3,20}$/;
const EMAIL_RX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Creates a new account. Fails if the email or username is already taken. */
export async function signUp(
  email: string,
  username: string,
  password: string
): Promise<AuthResult> {
  const e = email.trim().toLowerCase();
  const u = username.trim().toLowerCase();

  if (!EMAIL_RX.test(e)) return { ok: false, error: "Enter a valid email address." };
  if (!USERNAME_RX.test(u)) {
    return {
      ok: false,
      error: "Username must be 3–20 characters, using letters, numbers, - or _ only.",
    };
  }
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };

  await ensureIndexes();
  const col = await users();
  const now = new Date();

  try {
    const result = await col.insertOne({
      email: e,
      username: u,
      passwordHash: hashPassword(password),
      createdAt: now,
      lastLoginAt: now,
    });
    return { ok: true, userId: String(result.insertedId) };
  } catch (error) {
    // Let the unique indexes decide, rather than checking first and racing:
    // two simultaneous signups can both pass a findOne and only one can insert.
    if (typeof error === "object" && error && "code" in error && error.code === 11000) {
      // keyPattern is an object like { username: 1 } — stringifying it gives
      // "[object Object]", so read its keys instead.
      const fields = Object.keys(
        (error as { keyPattern?: Record<string, unknown> }).keyPattern ?? {}
      );
      return {
        ok: false,
        error: fields.includes("username")
          ? "That username is taken. Try another."
          : "An account with that email already exists. Log in instead.",
      };
    }
    throw error;
  }
}

/** Logs in with either a username or an email address. */
export async function logIn(identifier: string, password: string): Promise<AuthResult> {
  const id = identifier.trim().toLowerCase();
  if (!id || !password) return { ok: false, error: "Enter your username or email, and password." };

  const col = await users();
  const user = await col.findOne(id.includes("@") ? { email: id } : { username: id });

  // Same message either way — saying "no such user" would let anyone probe which
  // emails and usernames are registered.
  const rejection = { ok: false as const, error: "Those details don't match an account." };
  if (!user || !verifyPassword(password, user.passwordHash)) return rejection;

  await col.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  return { ok: true, userId: String(user._id) };
}
