import { createPublicReaderClient } from "@/backend/infrastructure/supabase/public-reader/public-reader";

export const dynamic = "force-dynamic";

const text = (status: number, body: string, head: boolean) =>
  new Response(head ? null : body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });

async function respond(head: boolean) {
  try {
    const { data, error } = await createPublicReaderClient().rpc(
      "get_public_site_about_image",
    );
    if (error) return text(503, "Image unavailable", head);
    const row = Array.isArray(data) ? data[0] : null;
    const hex = typeof row?.bytes === "string" ? row.bytes : null;
    if (!hex || !hex.startsWith("\\x"))
      return text(404, "Image unavailable", head);
    const bytes = Buffer.from(hex.slice(2), "hex");
    if (bytes.byteLength < 1 || bytes.byteLength > 1_048_576)
      return text(404, "Image unavailable", head);
    return new Response(head ? null : bytes, {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(bytes.byteLength),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return text(503, "Image unavailable", head);
  }
}
export async function GET() {
  return respond(false);
}
export async function HEAD() {
  return respond(true);
}
