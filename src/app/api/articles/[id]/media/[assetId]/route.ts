import { createHash } from "node:crypto";
import { z } from "zod";
import { getCurrentAccess } from "@/lib/auth/access/access";
import { isDraftUuid } from "@/lib/articles/draft-contract/draft-contract";
import { readMediaFile } from "@/lib/media/image-intake/media-form";
import { processArticleImage } from "@/lib/media/image-intake/image-intake";
import { createTrustedMediaClient } from "@/lib/supabase/media-admin/media-admin";
import { createServerSupabaseClient } from "@/lib/supabase/server/server";

const finalizedReceipt = z.strictObject({
  ok: z.literal(true),
  assetId: z.custom<string>(isDraftUuid),
  replayed: z.boolean(),
});
function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; assetId: string }> },
) {
  try {
    const { id: articleId, assetId } = await context.params;
    if (!isDraftUuid(articleId) || !isDraftUuid(assetId))
      return reply(400, { ok: false, code: "invalid_input" });
    const access = await getCurrentAccess();
    if (access.status !== "active")
      return reply(403, { ok: false, code: "forbidden" });
    const userClient = await createServerSupabaseClient();
    const { data: asset, error } = await userClient
      .from("media_assets")
      .select("id,article_id,uploader_user_id,object_key,status")
      .eq("id", assetId)
      .maybeSingle();
    if (error) return reply(503, { ok: false, code: "unavailable" });
    if (
      !asset ||
      asset.article_id !== articleId ||
      (asset.uploader_user_id !== access.userId &&
        access.role !== "administrator")
    )
      return reply(404, { ok: false, code: "not_found" });
    if (asset.status === "finalized")
      return reply(200, { ok: true, assetId, replayed: true });
    if (asset.status !== "pending")
      return reply(409, { ok: false, code: "conflict" });

    const file = await readMediaFile(request);
    if (!file.ok) return reply(file.code === "too_large" ? 413 : 400, file);
    const processed = await processArticleImage(file.bytes, file.contentType);
    if (!processed.ok)
      return reply(processed.code === "too_large" ? 413 : 400, processed);

    const trusted = createTrustedMediaClient();
    const bucket = trusted.storage.from("article-media");
    const { error: uploadError } = await bucket.upload(
      asset.object_key,
      processed.bytes,
      { contentType: "image/webp", upsert: false },
    );
    if (uploadError) {
      // A committed upload with a lost response is retryable, but never
      // replace bytes already present at this path.
      const { data: existing, error: downloadError } = await bucket.download(
        asset.object_key,
      );
      if (downloadError || !existing)
        return reply(503, { ok: false, code: "unavailable" });
      const hash = createHash("sha256")
        .update(new Uint8Array(await existing.arrayBuffer()))
        .digest("hex");
      if (hash !== processed.sha256)
        return reply(409, { ok: false, code: "conflict" });
    }
    const { data, error: finalizeError } = await trusted.rpc(
      "finalize_article_image_upload",
      {
        p_actor_user_id: access.userId,
        p_asset_id: assetId,
        p_sha256: processed.sha256,
        p_byte_size: processed.bytes.byteLength,
        p_width: processed.width,
        p_height: processed.height,
      },
    );
    if (finalizeError) return reply(503, { ok: false, code: "unavailable" });
    const receipt = finalizedReceipt.safeParse(data);
    if (!receipt.success || receipt.data.assetId !== assetId)
      return reply(503, { ok: false, code: "unavailable" });
    return reply(200, receipt.data);
  } catch {
    return reply(503, { ok: false, code: "unavailable" });
  }
}
