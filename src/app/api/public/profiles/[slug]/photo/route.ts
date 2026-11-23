import { createPublicReaderClient } from "@/backend/infrastructure/supabase/public-reader/public-reader";

export const dynamic = "force-dynamic";
const cache = "private, no-store";
type Context = { params: Promise<{ slug: string }> };

const text = (status: number, body: string, head: boolean) =>
  new Response(head ? null : body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });

async function respond({ params }: Context, head: boolean) {
  const { slug } = await params;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/u.test(slug) || slug.length > 180)
    return text(404, "Photo unavailable", head);
  try {
    const { data, error } = await createPublicReaderClient().rpc(
      "get_public_profile_photo",
      { p_slug: slug },
    );
    if (error) return text(503, "Photo unavailable", head);
    const row = Array.isArray(data) ? data[0] : null;
    const hex = typeof row?.bytes === "string" ? row.bytes : null;
    if (!hex || !hex.startsWith("\\x"))
      return text(404, "Photo unavailable", head);
    const bytes = Buffer.from(hex.slice(2), "hex");
    if (bytes.byteLength < 1 || bytes.byteLength > 524288)
      return text(404, "Photo unavailable", head);
    return new Response(head ? null : bytes, {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(bytes.byteLength),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": cache,
      },
    });
  } catch {
    return text(503, "Photo unavailable", head);
  }
}
export async function GET(_request: Request, context: Context) {
  return respond(context, false);
}
export async function HEAD(_request: Request, context: Context) {
  return respond(context, true);
}
