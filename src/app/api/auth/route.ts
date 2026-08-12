import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** DELETE /api/auth — sign out. Signup and login live in their own routes. */
export async function DELETE() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
