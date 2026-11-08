"use server";
import { revalidatePath } from "next/cache";
import { getCurrentAccess } from "@/lib/auth/access/access";
import { createServerSupabaseClient } from "@/lib/supabase/server/server";
import {
  deletionCommandSchema,
  parseDeletionResult,
  type DeletionCommand,
  type DeletionResult,
} from "./article-deletion";
export async function deleteArticleAction(
  command: DeletionCommand,
): Promise<DeletionResult> {
  const parsed = deletionCommandSchema.safeParse(command);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  try {
    const access = await getCurrentAccess();
    if (access.status !== "active" || access.role !== "administrator")
      return { ok: false, code: "forbidden" };
    const client = await createServerSupabaseClient();
    const { data, error } = await client.rpc("delete_archived_article", {
      p_article_id: parsed.data.articleId,
      p_expected_version: parsed.data.expectedVersion,
      p_request_id: parsed.data.requestId,
      p_confirm: parsed.data.confirm,
    });
    if (error) return { ok: false, code: "unavailable" };
    const result = parseDeletionResult(data, parsed.data.articleId);
    if (result.ok) {
      try {
        revalidatePath("/dashboard/admin/articles");
        revalidatePath("/dashboard/admin/audit");
        revalidatePath("/dashboard/admin/homepage");
      } catch {
        console.error("Deletion committed; private revalidation failed.", {
          requestId: parsed.data.requestId,
        });
      }
    }
    return result;
  } catch {
    return { ok: false, code: "unavailable" };
  }
}
