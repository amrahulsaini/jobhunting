import { NextResponse } from "next/server";
import { createSession, logIn } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { identifier, password } = await request.json();

    if (typeof identifier !== "string" || typeof password !== "string") {
      return NextResponse.json(
        { ok: false, error: "Username or email, and password, are required." },
        { status: 400 }
      );
    }

    const result = await logIn(identifier, password);
    if (!result.ok) return NextResponse.json(result, { status: 401 });

    await createSession(result.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Log in failed." },
      { status: 500 }
    );
  }
}
