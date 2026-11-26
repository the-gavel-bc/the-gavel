import { readPublicMedia } from "@/backend/public-media/public-media";
import { resizePublicImage } from "@/backend/public-media/resize-public-image";
import { parsePublicImageWidth } from "@/shared/reader/public-image/public-image";

export const dynamic = "force-dynamic";
const cache =
  "public, max-age=300, s-maxage=300, must-revalidate, proxy-revalidate";
type Context = { params: Promise<{ articleId: string; assetId: string }> };

function failure(head: boolean, status: 404 | 503) {
  return new Response(head ? null : "Image unavailable", {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function respond(request: Request, context: Context, head: boolean) {
  const width = parsePublicImageWidth(
    new URL(request.url).searchParams.get("w"),
  );
  if (width === "invalid") return failure(head, 404);
  const { articleId, assetId } = await context.params;
  // Authorization and integrity checks always run on the stored original;
  // a resized variant is derived only after they pass.
  const image = await readPublicMedia(articleId, assetId);
  if (image.kind !== "ok")
    return failure(head, image.kind === "notFound" ? 404 : 503);
  let bytes: ArrayBuffer | Uint8Array<ArrayBuffer> = image.bytes;
  if (width) {
    try {
      bytes = await resizePublicImage(image.bytes, width);
    } catch {
      return failure(head, 503);
    }
  }
  return new Response(head ? null : bytes, {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": cache,
    },
  });
}
export async function GET(request: Request, context: Context) {
  return respond(request, context, false);
}
export async function HEAD(request: Request, context: Context) {
  return respond(request, context, true);
}
