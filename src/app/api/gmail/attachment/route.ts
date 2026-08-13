import { currentUser } from "@/lib/auth/session";
import { getAttachment } from "@/lib/gmail/client";

export const dynamic = "force-dynamic";

/** GET /api/gmail/attachment?message=…&id=…&name=… — downloads one attachment. */
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user?._id) return new Response("Unauthorised", { status: 401 });

  const params = new URL(request.url).searchParams;
  const messageId = params.get("message");
  const attachmentId = params.get("id");
  const name = params.get("name") ?? "attachment";

  if (!messageId || !attachmentId) return new Response("Missing parameters", { status: 400 });

  try {
    const bytes = await getAttachment(user._id, messageId, attachmentId);

    return new Response(new Uint8Array(bytes), {
      headers: {
        // Always download rather than render: mail attachments are untrusted,
        // and an inline HTML or SVG file would execute in our origin.
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}"`,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "Could not fetch that attachment.",
      { status: 502 }
    );
  }
}
