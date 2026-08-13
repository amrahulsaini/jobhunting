import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { authorizeUrl, gmailConfigured, makeState } from "@/lib/gmail/oauth";

export const dynamic = "force-dynamic";

/** GET /api/gmail/connect — sends the user to Google's consent screen. */
export async function GET() {
  const user = await currentUser();
  if (!user?._id) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"));
  }

  if (!gmailConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Gmail is not configured yet. Add GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET to .env.local.",
      },
      { status: 501 }
    );
  }

  // State is signed with the user id so the callback cannot be used to attach
  // an attacker's mailbox to someone else's account.
  return NextResponse.redirect(authorizeUrl(makeState(String(user._id))));
}
