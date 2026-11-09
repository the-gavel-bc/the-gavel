import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createPublicReaderClient } from "@/backend/infrastructure/supabase/public-reader/public-reader";
import { isDraftUuid } from "@/shared/articles/draft-contract/draft-contract";

const metadata = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("notFound") }),
  z.strictObject({
    kind: z.literal("ok"),
    byteSize: z.number().int().min(12).max(10485760),
    sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  }),
]);
type MediaResult =
  { kind: "notFound" | "unavailable" } | { kind: "ok"; bytes: ArrayBuffer };

export async function readPublicMedia(
  articleId: string,
  assetId: string,
): Promise<MediaResult> {
  if (!isDraftUuid(articleId) || !isDraftUuid(assetId))
    return { kind: "notFound" };
  // PostgreSQL UUIDs and canonical object keys are lowercase.
  articleId = articleId.toLowerCase();
  assetId = assetId.toLowerCase();
  try {
    const client = createPublicReaderClient();
    const projection = await client.rpc("get_public_article_media", {
      p_article_id: articleId,
      p_asset_id: assetId,
    });
    if (projection.error) return { kind: "unavailable" };
    const parsed = metadata.safeParse(projection.data);
    if (!parsed.success) return { kind: "unavailable" };
    if (parsed.data.kind === "notFound") return parsed.data;
    // The cookie-free client's fetch forces no-store. Storage rechecks access
    // independently if archiving wins after the metadata statement.
    const result = await client.storage
      .from("article-media")
      .download(`${articleId}/${assetId}.webp`);
    if (result.error) {
      const code =
        "statusCode" in result.error ? Number(result.error.statusCode) : NaN;
      return {
        kind: [400, 401, 403, 404].includes(code) ? "notFound" : "unavailable",
      };
    }
    const blob = result.data;
    if (
      !blob ||
      blob.type !== "image/webp" ||
      blob.size !== parsed.data.byteSize
    )
      return { kind: "unavailable" };
    const bytes = await blob.arrayBuffer();
    if (
      createHash("sha256").update(new Uint8Array(bytes)).digest("hex") !==
      parsed.data.sha256
    )
      return { kind: "unavailable" };
    const tag = (offset: number) =>
      String.fromCharCode(...new Uint8Array(bytes, offset, 4));
    if (
      bytes.byteLength < 16 ||
      tag(0) !== "RIFF" ||
      tag(8) !== "WEBP" ||
      !["VP8 ", "VP8L", "VP8X"].includes(tag(12)) ||
      new DataView(bytes).getUint32(4, true) + 8 !== bytes.byteLength
    )
      return { kind: "unavailable" };
    return { kind: "ok", bytes };
  } catch {
    return { kind: "unavailable" };
  }
}
