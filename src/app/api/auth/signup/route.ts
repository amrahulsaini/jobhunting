import { NextResponse } from "next/server";
import { createSession, signUp } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { email, username, password } = await request.json();

    if (typeof email !== "string" || typeof username !== "string" || typeof password !== "string") {
      return NextResponse.json(
        { ok: false, error: "Email, username and password are required." },
        { status: 400 }
      );
    }

    const result = await signUp(email, username, password);
    if (!result.ok) return NextResponse.json(result, { status: 409 });

    await createSession(result.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Sign up failed." },
      { status: 500 }
    );
  }
}
