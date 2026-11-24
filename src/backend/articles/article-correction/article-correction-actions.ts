"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAccess } from "@/backend/auth/access/access";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";
import { hasUnsupportedDisplayCharacter } from "@/shared/validation/display-text/display-text";
import { isDraftUuid } from "@/shared/articles/draft-contract/draft-contract";

export type CorrectionResult =
  | { ok: true; changed: boolean }
  | {
      ok: false;
      code:
        | "invalid_input"
        | "forbidden"
        | "not_found"
        | "conflict"
        | "request_conflict"
        | "rate_limited"
        | "retryable"
        | "unavailable";
    };

const commandSchema = z.strictObject({
  articleId: z.custom<string>(isDraftUuid),
  requestId: z.custom<string>(isDraftUuid),
  // What the editor loaded; null when the article had no correction.
  expectedCorrection: z.string().max(2000).nullable(),
  // Blank clears the correction. Same text rules as the database.
  correction: z
    .string()
    .max(4000)
    .refine((value) => {
      const text = value.trim();
      return (
        text.length <= 2000 &&
        !/[<>]/u.test(text) &&
        !/[\p{Cc}]/u.test(text.replace(/[\n\t]/gu, "")) &&
        !hasUnsupportedDisplayCharacter(text)
      );
    }),
});
export type CorrectionCommand = z.infer<typeof commandSchema>;

const known = [
  "invalid_input",
  "forbidden",
  "not_found",
  "conflict",
  "request_conflict",
  "rate_limited",
  "retryable",
] as const;

// Editors and administrators only; the database decides per article.
export async function saveArticleCorrectionAction(
  command: CorrectionCommand,
): Promise<CorrectionResult> {
  const parsed = commandSchema.safeParse(command);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  try {
    const access = await getCurrentAccess();
    if (
      access.status !== "active" ||
      (access.role !== "editor" && access.role !== "administrator")
    )
      return { ok: false, code: "forbidden" };
    const client = await createServerSupabaseClient();
    const { data, error } = await client.rpc("set_article_correction", {
      p_article_id: parsed.data.articleId,
      p_expected_correction: parsed.data.expectedCorrection as string,
      p_request_id: parsed.data.requestId,
      p_correction: parsed.data.correction,
    });
    if (error) return { ok: false, code: "unavailable" };
    if (typeof data !== "object" || data === null || !("ok" in data))
      return { ok: false, code: "unavailable" };
    if (data.ok === true) {
      revalidatePath(`/dashboard/articles/${parsed.data.articleId}`);
      return { ok: true, changed: "changed" in data && data.changed === true };
    }
    const code = "code" in data ? data.code : null;
    return {
      ok: false,
      code: known.find((value) => value === code) ?? "unavailable",
    };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}
