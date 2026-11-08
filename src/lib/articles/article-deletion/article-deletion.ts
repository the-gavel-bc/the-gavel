import { z } from "zod";
import { isDraftUuid } from "@/lib/articles/draft-contract/draft-contract";
const uuid = z.custom<string>(isDraftUuid);
export const deletionCommandSchema = z.strictObject({
  articleId: uuid,
  expectedVersion: z.number().int().min(1).max(2147483647),
  requestId: uuid,
  confirm: z.literal(true),
});
export type DeletionCommand = z.infer<typeof deletionCommandSchema>;
const resultSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    articleId: uuid,
    replayed: z.boolean(),
  }),
  z.strictObject({
    ok: z.literal(false),
    code: z.enum([
      "invalid_input",
      "forbidden",
      "conflict",
      "request_conflict",
      "not_found",
      "media_cleanup_required",
      "cleanup_unavailable",
      "unavailable",
    ]),
  }),
]);
export type DeletionResult = z.infer<typeof resultSchema>;
export function parseDeletionResult(
  input: unknown,
  articleId: string,
): DeletionResult {
  const result = resultSchema.safeParse(input);
  if (
    !result.success ||
    (result.data.ok && result.data.articleId !== articleId)
  )
    return { ok: false, code: "unavailable" };
  return result.data;
}
