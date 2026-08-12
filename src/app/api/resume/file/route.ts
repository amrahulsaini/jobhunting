import { currentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** GET /api/resume/file — returns the caller's own resume. */
export async function GET() {
  const user = await currentUser();
  if (!user?.resume) {
    return new Response("Not found", { status: 404 });
  }

  const bytes = user.resume.data.buffer;

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": user.resume.mimeType,
      // `attachment` matters: without it a PDF renders inline and the browser
      // never uses the real filename.
      "Content-Disposition": `attachment; filename="${encodeURIComponent(user.resume.filename)}"`,
      "Content-Length": String(bytes.byteLength),
      // Never let a shared cache hold someone's resume.
      "Cache-Control": "private, no-store",
    },
  });
}
