import { z } from "zod";
import {
  DRAFT_ERROR_CODES,
  isDraftUuid,
  type DraftFailure,
} from "../draft-contract/draft-contract";
import { isDatabaseTimestamp } from "../draft-cursor/draft-cursor";

export type ArticleLifecycleCommand = {
  articleId: string;
  expectedVersion: number;
  requestId: string;
  /** Required when an editor returns an article to its author. */
  note?: string;
};
export type ArticleLifecycleResult =
  | DraftFailure
  | {
      ok: true;
      articleId: string;
      status: "draft" | "published" | "archived";
      version: number;
      updatedAt: string;
      replayed: boolean;
      changed: boolean;
    };

const uuid = z.custom<string>(isDraftUuid);
const version = z.number().int().min(1).max(2147483647);
const commandSchema = z.strictObject({
  articleId: uuid,
  expectedVersion: version,
  requestId: uuid,
  note: z.string().trim().min(1).max(500).optional(),
});
const resultSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    articleId: uuid,
    status: z.enum(["draft", "published", "archived"]),
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

export function parseArticleLifecycleCommand(
  value: unknown,
): DraftFailure | { ok: true; value: ArticleLifecycleCommand } {
  const parsed = commandSchema.safeParse(value);
  return parsed.success
    ? {
        ok: true,
        value: {
          articleId: parsed.data.articleId.toLowerCase(),
          expectedVersion: parsed.data.expectedVersion,
          requestId: parsed.data.requestId.toLowerCase(),
          ...(parsed.data.note ? { note: parsed.data.note } : {}),
        },
      }
    : { ok: false, code: "invalid_input" };
}

export function parseArticleLifecycleResult(
  value: unknown,
  status: "draft" | "published" | "archived",
  articleId: string,
): ArticleLifecycleResult {
  const parsed = resultSchema.safeParse(value);
  if (!parsed.success) return { ok: false, code: "unavailable" };
  if (
    parsed.data.ok &&
    (parsed.data.status !== status || parsed.data.articleId !== articleId)
  )
    return { ok: false, code: "unavailable" };
  return parsed.data;
}
