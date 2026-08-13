import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { currentUser } from "@/lib/auth/session";
import { exchangeCode, fetchEmailAddress, readState, saveAccount } from "@/lib/gmail/oauth";

export const dynamic = "force-dynamic";

const base = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const back = (params: Record<string, string>) =>
  NextResponse.redirect(`${base()}/outreach?${new URLSearchParams(params)}`);

/** GET /api/gmail/callback — Google returns here after consent. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  // The user can decline on Google's screen; that is not a failure.
  if (error) return back({ error: error === "access_denied" ? "You declined access." : error });
  if (!code || !state) return back({ error: "Google did not return an authorisation code." });

  const stateUserId = readState(state);
  if (!stateUserId) return back({ error: "That authorisation link is invalid or expired." });

  // Belt and braces: the state must also match whoever is signed in now.
  const user = await currentUser();
  if (!user?._id || String(user._id) !== stateUserId) {
    return back({ error: "Sign in again and reconnect Gmail." });
  }

  try {
    const tokens = await exchangeCode(code);
    const address = await fetchEmailAddress(tokens.access_token);

    await saveAccount(new ObjectId(stateUserId), tokens, address);
    return back({ connected: address ?? "1" });
  } catch (err) {
    return back({ error: err instanceof Error ? err.message : "Could not connect Gmail." });
  }
}
