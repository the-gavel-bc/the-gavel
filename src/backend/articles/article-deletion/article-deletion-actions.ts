"use server";
import { revalidatePath } from "next/cache";
import { invalidatePublicShell } from "@/backend/public-site/public-shell-cache/public-shell-cache";
import { getCurrentAccess } from "@/backend/auth/access/access";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";
import {
  deletionCommandSchema,
  parseDeletionResult,
  type DeletionCommand,
  type DeletionResult,
} from "../../../shared/articles/article-deletion/article-deletion";
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
      invalidatePublicShell();
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
