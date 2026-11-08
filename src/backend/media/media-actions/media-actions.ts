"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentAccess } from "@/backend/auth/access/access";
import { isDraftUuid } from "@/shared/articles/draft-contract/draft-contract";
import { parseDraftWriteResult } from "@/shared/articles/draft-action-contract/draft-action-contract";
import type { DraftWriteResult } from "@/shared/articles/draft-contract/draft-contract";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";

export type MediaRequestResult =
  | {
      ok: true;
      assetId: string;
      status: "pending" | "uploading" | "finalized";
      replayed: boolean;
    }
  | {
      ok: false;
      code:
        | "invalid_input"
        | "forbidden"
        | "not_found"
        | "conflict"
        | "request_conflict"
        | "rate_limited"
        | "unavailable";
    };

const responseSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    assetId: z.custom<string>(isDraftUuid),
    status: z.enum(["pending", "uploading", "finalized"]),
    replayed: z.boolean(),
  }),
  z.strictObject({
    ok: z.literal(false),
    code: z.enum([
      "invalid_input",
      "forbidden",
      "not_found",
      "conflict",
      "request_conflict",
      "rate_limited",
      "unavailable",
    ]),
  }),
]);

export async function requestArticleImageUpload(
  articleId: string,
  requestId: string,
): Promise<MediaRequestResult> {
  if (!isDraftUuid(articleId) || !isDraftUuid(requestId))
    return { ok: false, code: "invalid_input" };
  try {
    const access = await getCurrentAccess();
    if (access.status !== "active") return { ok: false, code: "forbidden" };
    const client = await createServerSupabaseClient();
    const { data, error } = await client.rpc("request_article_image_upload", {
      p_article_id: articleId,
      p_request_id: requestId,
    });
    if (error) return { ok: false, code: "unavailable" };
    const parsed = responseSchema.safeParse(data);
    return parsed.success ? parsed.data : { ok: false, code: "unavailable" };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}

const uuid = z.custom<string>(isDraftUuid);
const imageCommandBase = z.strictObject({
  articleId: uuid,
  expectedVersion: z.number().int().min(1).max(2147483647),
  requestId: uuid,
});
const imageText = z
  .string()
  .min(1)
  .max(240)
  .refine((value) => value.trim() === value && value.trim().length > 0);
const imageCommand = z.union([
  imageCommandBase.extend({
    assetId: uuid,
    altText: imageText,
    credit: imageText,
  }),
  imageCommandBase.extend({
    assetId: z.null(),
    altText: z.null(),
    credit: z.null(),
  }),
]);

export async function setArticleMainImage(
  command: unknown,
): Promise<DraftWriteResult> {
  const parsed = imageCommand.safeParse(command);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  try {
    const access = await getCurrentAccess();
    if (access.status !== "active") return { ok: false, code: "forbidden" };
    const client = await createServerSupabaseClient();
    const value = parsed.data;
    const { data, error } = await client.rpc("set_article_main_image", {
      p_article_id: value.articleId,
      p_expected_version: value.expectedVersion,
      p_request_id: value.requestId,
      // Generated RPC arguments mark SQL nullable inputs as required strings.
      p_asset_id: value.assetId as string,
      p_alt_text: value.altText as string,
      p_credit: value.credit as string,
    });
    if (error) return { ok: false, code: "unavailable" };
    const result = parseDraftWriteResult(data);
    if (result.ok) {
      try {
        revalidatePath("/dashboard");
        revalidatePath(`/dashboard/articles/${result.articleId}`);
      } catch {
        // The write committed; a cache failure cannot undo the receipt.
      }
    }
    return result;
  } catch {
    return { ok: false, code: "unavailable" };
  }
}
