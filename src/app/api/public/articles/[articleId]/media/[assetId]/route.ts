import { readPublicMedia } from "@/backend/public-media/public-media";

export const dynamic = "force-dynamic";
const cache =
  "public, max-age=300, s-maxage=300, must-revalidate, proxy-revalidate";
type Context = { params: Promise<{ articleId: string; assetId: string }> };

async function respond(context: Context, head: boolean) {
  const { articleId, assetId } = await context.params;
  const image = await readPublicMedia(articleId, assetId);
  if (image.kind !== "ok") {
    return new Response(head ? null : "Image unavailable", {
      status: image.kind === "notFound" ? 404 : 503,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  return new Response(head ? null : image.bytes, {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(image.bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": cache,
    },
  });
}
export async function GET(_request: Request, context: Context) {
  return respond(context, false);
}
export async function HEAD(_request: Request, context: Context) {
  return respond(context, true);
}
