"use server";

import { revalidatePath } from "next/cache";
import { invalidatePublicShell } from "@/backend/public-site/public-shell-cache/public-shell-cache";
import { draftRpcFailure } from "../draft-actions/draft-rpc-failure";
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
  operation: "submit" | "return" | "publish" | "archive" | "restore",
): Promise<ArticleLifecycleResult> {
  const parsed = parseArticleLifecycleCommand(command);
  if (!parsed.ok) return parsed;
  try {
    const access = await getCurrentAccess();
    if (access.status !== "active") return { ok: false, code: "forbidden" };
    if (operation === "restore" && access.role !== "administrator")
      return { ok: false, code: "forbidden" };
    const client = await createServerSupabaseClient();
    const args = {
      p_article_id: parsed.value.articleId,
      p_expected_version: parsed.value.expectedVersion,
      p_request_id: parsed.value.requestId,
    };
    // The database decides who may do what; this only picks the operation.
    const { data, error } =
      operation === "return"
        ? await client.rpc("return_article", {
            ...args,
            p_note: parsed.value.note ?? "",
          })
        : await client.rpc(
            operation === "submit"
              ? "submit_article"
              : operation === "publish"
                ? "publish_article"
                : operation === "archive"
                  ? "archive_article"
                  : "restore_article",
            args,
          );
    if (error) return draftRpcFailure(error);
    const result = parseArticleLifecycleResult(
      data,
      operation === "archive"
        ? "archived"
        : operation === "submit" || operation === "return"
          ? "draft"
          : "published",
      parsed.value.articleId,
    );
    if (result.ok) {
      if (
        operation === "publish" ||
        operation === "archive" ||
        operation === "restore"
      )
        invalidatePublicShell();
      try {
        revalidatePath("/dashboard");
        revalidatePath("/dashboard/review");
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

export async function submitArticleAction(
  command: ArticleLifecycleCommand,
): Promise<ArticleLifecycleResult> {
  return transition(command, "submit");
}

export async function returnArticleAction(
  command: ArticleLifecycleCommand,
): Promise<ArticleLifecycleResult> {
  return transition(command, "return");
}
