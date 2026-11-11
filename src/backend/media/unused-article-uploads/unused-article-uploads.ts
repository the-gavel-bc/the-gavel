"use server";

import { z } from "zod";
import { getCurrentAccess } from "@/backend/auth/access/access";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";
import { isDraftUuid } from "@/shared/articles/draft-contract/draft-contract";

const uuid = z.custom<string>(isDraftUuid);
const response = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    items: z
      .array(
        z.strictObject({
          assetId: uuid,
          createdAt: z.iso.datetime({ offset: true }),
          status: z.enum(["finalized", "deleting"]),
        }),
      )
      .max(25),
    nextCursor: uuid.nullable(),
  }),
  z.strictObject({
    ok: z.literal(false),
    code: z.enum([
      "invalid_input",
      "forbidden",
      "not_found",
      "conflict",
      "unavailable",
    ]),
  }),
]);
export type UnusedArticleUploadsResult = z.infer<typeof response>;

export async function listUnusedArticleUploads(
  articleId: string,
  afterId: string | null = null,
): Promise<UnusedArticleUploadsResult> {
  if (!isDraftUuid(articleId) || (afterId !== null && !isDraftUuid(afterId)))
    return { ok: false, code: "invalid_input" };
  try {
    const access = await getCurrentAccess();
    if (access.status !== "active") return { ok: false, code: "forbidden" };
    const client = await createServerSupabaseClient();
    const { data, error } = await client.rpc("list_unused_article_uploads", {
      p_article_id: articleId,
      p_after_id: afterId as string,
      p_limit: 25,
    });
    if (error) return { ok: false, code: "unavailable" };
    const parsed = response.safeParse(data);
    if (!parsed.success) return { ok: false, code: "unavailable" };
    const result = parsed.data;
    if (
      result.ok &&
      (result.items.some(
        (item, index) =>
          (afterId !== null && item.assetId <= afterId.toLowerCase()) ||
          (index > 0 && item.assetId <= result.items[index - 1].assetId),
      ) ||
        (result.nextCursor !== null &&
          result.nextCursor !== result.items.at(-1)?.assetId))
    )
      return { ok: false, code: "unavailable" };
    return result;
  } catch {
    return { ok: false, code: "unavailable" };
  }
}
