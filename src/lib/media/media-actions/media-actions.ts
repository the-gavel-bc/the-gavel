"use server";

import { z } from "zod";
import { getCurrentAccess } from "@/lib/auth/access/access";
import { isDraftUuid } from "@/lib/articles/draft-contract/draft-contract";
import { createServerSupabaseClient } from "@/lib/supabase/server/server";

export type MediaRequestResult =
  | {
      ok: true;
      assetId: string;
      status: "pending" | "finalized";
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
    status: z.enum(["pending", "finalized"]),
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
