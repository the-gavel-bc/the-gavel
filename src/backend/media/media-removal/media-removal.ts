"use server";

import { z } from "zod";
import { getCurrentAccess } from "@/backend/auth/access/access";
import { isDraftUuid } from "@/shared/articles/draft-contract/draft-contract";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";
import { createTrustedMediaClient } from "@/backend/infrastructure/supabase/media-admin/media-admin";

export type MediaRemovalResult =
  | { ok: true; assetId: string }
  | {
      ok: false;
      code:
        | "invalid_input"
        | "forbidden"
        | "not_found"
        | "conflict"
        | "unavailable";
    };

const markReceipt = z.strictObject({
  ok: z.literal(true),
  assetId: z.custom<string>(isDraftUuid),
  replayed: z.boolean(),
});

export async function removeUnusedArticleImage(
  assetId: string,
): Promise<MediaRemovalResult> {
  if (!isDraftUuid(assetId)) return { ok: false, code: "invalid_input" };
  try {
    const access = await getCurrentAccess();
    if (access.status !== "active") return { ok: false, code: "forbidden" };
    const user = await createServerSupabaseClient();
    // The caller-scoped RPC checks references and retires the asset before Storage
    // deletion. Keep that state on failure so retries use the same authorized key.
    const { data: mark, error: markError } = await user.rpc(
      "mark_article_image_for_removal",
      {
        p_asset_id: assetId,
      },
    );
    if (markError) return { ok: false, code: "unavailable" };
    if (
      mark &&
      typeof mark === "object" &&
      "ok" in mark &&
      mark.ok === false &&
      "code" in mark
    ) {
      if (
        mark.code === "forbidden" ||
        mark.code === "not_found" ||
        mark.code === "conflict" ||
        mark.code === "invalid_input"
      )
        return { ok: false, code: mark.code };
      return { ok: false, code: "unavailable" };
    }
    const receipt = markReceipt.safeParse(mark);
    if (!receipt.success || receipt.data.assetId !== assetId)
      return { ok: false, code: "unavailable" };
    const trusted = createTrustedMediaClient();
    const { data: asset, error: assetError } = await trusted
      .from("media_assets")
      .select("object_key,status")
      .eq("id", assetId)
      .maybeSingle();
    if (assetError || !asset || asset.status !== "deleting")
      return { ok: false, code: "unavailable" };
    const { error: removeError } = await trusted.storage
      .from("article-media")
      .remove([asset.object_key]);
    if (removeError) return { ok: false, code: "unavailable" };
    const { data: complete, error: completeError } = await trusted.rpc(
      "complete_article_image_removal",
      {
        p_actor_user_id: access.userId,
        p_asset_id: assetId,
      },
    );
    if (completeError) return { ok: false, code: "unavailable" };
    const finished = markReceipt.safeParse(complete);
    return finished.success && finished.data.assetId === assetId
      ? { ok: true, assetId }
      : { ok: false, code: "unavailable" };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}
