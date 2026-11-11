"use server";
import { getCurrentAccess } from "@/backend/auth/access/access";
import { isDraftUuid } from "../../../shared/articles/draft-contract/draft-contract";
import {
  getDraftEditorData,
  type DraftDetailResult,
} from "../draft-queries/draft-queries";
import type { DraftOptions } from "../draft-options/draft-options";
export type DraftReviewResult =
  | { ok: true; detail: DraftDetailResult; options: DraftOptions | null }
  | { ok: false; code: "invalid_input" | "forbidden" | "unavailable" };
export async function reviewDraftAction(
  articleId: string,
): Promise<DraftReviewResult> {
  if (!isDraftUuid(articleId)) return { ok: false, code: "invalid_input" };
  try {
    const access = await getCurrentAccess();
    if (access.status !== "active") return { ok: false, code: "forbidden" };
    const { detail, options } = await getDraftEditorData(articleId);
    return { ok: true, detail, options };
  } catch {
    // A read/access failure must not navigate away from uncommitted local input.
    return { ok: false, code: "unavailable" };
  }
}
