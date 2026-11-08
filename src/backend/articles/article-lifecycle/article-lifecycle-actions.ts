"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAccess } from "@/backend/auth/access/access";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";
import {
  parseArticleLifecycleCommand,
  parseArticleLifecycleResult,
  type ArticleLifecycleCommand,
  type ArticleLifecycleResult,
} from "../../../shared/articles/article-lifecycle/article-lifecycle";

async function transition(
  command: ArticleLifecycleCommand,
  operation: "publish" | "archive" | "restore",
): Promise<ArticleLifecycleResult> {
  const parsed = parseArticleLifecycleCommand(command);
  if (!parsed.ok) return parsed;
  try {
    const access = await getCurrentAccess();
    if (access.status !== "active") return { ok: false, code: "forbidden" };
    if (operation === "restore" && access.role !== "administrator")
      return { ok: false, code: "forbidden" };
    const client = await createServerSupabaseClient();
    const { data, error } = await client.rpc(
      operation === "publish"
        ? "publish_article"
        : operation === "archive"
          ? "archive_article"
          : "restore_article",
      {
        p_article_id: parsed.value.articleId,
        p_expected_version: parsed.value.expectedVersion,
        p_request_id: parsed.value.requestId,
      },
    );
    if (error) return { ok: false, code: "unavailable" };
    const result = parseArticleLifecycleResult(
      data,
      operation === "archive" ? "archived" : "published",
      parsed.value.articleId,
    );
    if (result.ok) {
      try {
        revalidatePath("/dashboard");
        revalidatePath(`/dashboard/articles/${result.articleId}`);
      } catch {
        console.error(
          "Article transition committed; private revalidation failed.",
          {
            requestId: parsed.value.requestId,
          },
        );
      }
    }
    return result;
  } catch {
    return { ok: false, code: "unavailable" };
  }
}

export async function publishArticleAction(
  command: ArticleLifecycleCommand,
): Promise<ArticleLifecycleResult> {
  return transition(command, "publish");
}

export async function archiveArticleAction(
  command: ArticleLifecycleCommand,
): Promise<ArticleLifecycleResult> {
  return transition(command, "archive");
}

export async function restoreArticleAction(
  command: ArticleLifecycleCommand,
): Promise<ArticleLifecycleResult> {
  return transition(command, "restore");
}
