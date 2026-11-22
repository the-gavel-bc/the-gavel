import { z } from "zod";
import {
  checkDraftStructure,
  DRAFT_ERROR_CODES,
  isDraftUuid,
  type CreateDraftCommand,
  type SaveDraftCommand,
  type DraftFailure,
  type DraftWriteResult,
} from "../draft-contract/draft-contract";
import { isDatabaseTimestamp } from "../draft-cursor/draft-cursor";
const uuid = z.custom<string>(isDraftUuid);
const version = z.number().int().min(1).max(2147483647);
const create = z.strictObject({ requestId: uuid, draft: z.unknown() });
const save = create.extend({ articleId: uuid, expectedVersion: version });
type Parsed<T> = DraftFailure | { ok: true; value: T };
export function parseCreateCommand(value: unknown): Parsed<CreateDraftCommand> {
  const parsed = create.safeParse(value);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  // PostgreSQL checks new text after resolving existing request receipts.
  const draft = checkDraftStructure(parsed.data.draft);
  return draft.ok
    ? {
        ok: true,
        value: {
          requestId: parsed.data.requestId.toLowerCase(),
          draft: draft.value,
        },
      }
    : draft;
}
export function parseSaveCommand(value: unknown): Parsed<SaveDraftCommand> {
  const parsed = save.safeParse(value);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  const draft = checkDraftStructure(parsed.data.draft);
  return draft.ok
    ? {
        ok: true,
        value: {
          requestId: parsed.data.requestId.toLowerCase(),
          articleId: parsed.data.articleId.toLowerCase(),
          expectedVersion: parsed.data.expectedVersion,
          draft: draft.value,
        },
      }
    : draft;
}
const result = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    articleId: uuid,
    version,
    updatedAt: z.custom<string>(isDatabaseTimestamp),
    replayed: z.boolean(),
    changed: z.boolean(),
  }),
  z.strictObject({
    ok: z.literal(false),
    code: z.enum(DRAFT_ERROR_CODES),
    fieldErrors: z
      .partialRecord(
        z.enum([
          "title",
          "sectionId",
          "excerpt",
          "content",
          "seoKeyphrase",
          "metaDescription",
          "publicationDate",
          "categoryIds",
          "tagIds",
          "contributors",
        ]),
        z.string().max(240),
      )
      .optional(),
  }),
]);
export function parseDraftWriteResult(value: unknown): DraftWriteResult {
  const parsed = result.safeParse(value);
  return parsed.success ? parsed.data : { ok: false, code: "unavailable" };
}
