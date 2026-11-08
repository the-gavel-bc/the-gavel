"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAccess } from "@/backend/auth/access/access";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";
import {
  parseCreateCommand,
  parseSaveCommand,
  parseDraftWriteResult,
} from "../../../shared/articles/draft-action-contract/draft-action-contract";
import type {
  CreateDraftCommand,
  SaveDraftCommand,
  DraftWriteResult,
} from "../../../shared/articles/draft-contract/draft-contract";

function refreshPrivatePaths(
  result: DraftWriteResult,
  requestId: string,
): DraftWriteResult {
  if (result.ok) {
    try {
      revalidatePath("/dashboard");
      revalidatePath(`/dashboard/articles/${result.articleId}`);
    } catch {
      // The RPC already committed. Never turn a confirmed receipt into uncertainty.
      console.error("Draft committed; private revalidation failed.", {
        requestId,
      });
    }
  }
  return result;
}

export async function createDraftAction(
  command: CreateDraftCommand,
): Promise<DraftWriteResult> {
  const parsed = parseCreateCommand(command);
  if (!parsed.ok) return parsed;
  try {
    const access = await getCurrentAccess();
    if (access.status !== "active") return { ok: false, code: "forbidden" };
    const client = await createServerSupabaseClient();
    const { data, error } = await client.rpc("create_article_draft", {
      p_request_id: parsed.value.requestId,
      p_draft: parsed.value.draft,
    });
    if (error) return { ok: false, code: "unavailable" };
    return refreshPrivatePaths(
      parseDraftWriteResult(data),
      parsed.value.requestId,
    );
  } catch {
    return { ok: false, code: "unavailable" };
  }
}

export async function saveDraftAction(
  command: SaveDraftCommand,
): Promise<DraftWriteResult> {
  const parsed = parseSaveCommand(command);
  if (!parsed.ok) return parsed;
  try {
    const access = await getCurrentAccess();
    if (access.status !== "active") return { ok: false, code: "forbidden" };
    const client = await createServerSupabaseClient();
    const { data, error } = await client.rpc("save_article_draft", {
      p_article_id: parsed.value.articleId,
      p_expected_version: parsed.value.expectedVersion,
      p_request_id: parsed.value.requestId,
      p_draft: parsed.value.draft,
    });
    if (error) return { ok: false, code: "unavailable" };
    return refreshPrivatePaths(
      parseDraftWriteResult(data),
      parsed.value.requestId,
    );
  } catch {
    return { ok: false, code: "unavailable" };
  }
}

export async function savePublishedArticleAction(
  command: SaveDraftCommand,
): Promise<DraftWriteResult> {
  const parsed = parseSaveCommand(command);
  if (!parsed.ok) return parsed;
  try {
    const access = await getCurrentAccess();
    if (access.status !== "active") return { ok: false, code: "forbidden" };
    const client = await createServerSupabaseClient();
    const { data, error } = await client.rpc("save_published_article", {
      p_article_id: parsed.value.articleId,
      p_expected_version: parsed.value.expectedVersion,
      p_request_id: parsed.value.requestId,
      p_draft: parsed.value.draft,
    });
    if (error) return { ok: false, code: "unavailable" };
    return refreshPrivatePaths(
      parseDraftWriteResult(data),
      parsed.value.requestId,
    );
  } catch {
    return { ok: false, code: "unavailable" };
  }
}
