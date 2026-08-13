import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { getMessage, listMessages } from "@/lib/gmail/client";
import { disconnect } from "@/lib/gmail/oauth";

export const dynamic = "force-dynamic";

/** GET /api/gmail/messages — lists mail, or returns one message with ?id= */
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user?._id) {
    return NextResponse.json({ ok: false, error: "Please log in first." }, { status: 401 });
  }
  if (!user.gmail) {
    return NextResponse.json({ ok: false, error: "No Gmail account connected." }, { status: 400 });
  }

  const params = new URL(request.url).searchParams;
  const id = params.get("id");

  try {
    if (id) {
      return NextResponse.json({ ok: true, message: await getMessage(user._id, id) });
    }

    const page = await listMessages(user._id, {
      query: params.get("q") ?? "",
      limit: Number(params.get("limit") ?? 25),
      pageToken: params.get("pageToken") ?? undefined,
    });

    return NextResponse.json({ ok: true, ...page });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read mail.";
    // A revoked or expired grant needs a reconnect, not a retry.
    const needsReconnect = /refused|expired|reconnect/i.test(message);
    return NextResponse.json({ ok: false, error: message, needsReconnect }, { status: 502 });
  }
}

/** DELETE /api/gmail/messages — disconnects the account and revokes access. */
export async function DELETE() {
  const user = await currentUser();
  if (!user?._id) {
    return NextResponse.json({ ok: false, error: "Please log in first." }, { status: 401 });
  }

  await disconnect(user._id);
  return NextResponse.json({ ok: true });
}
