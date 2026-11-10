import "server-only";
import type { PublicArticleCard } from "@/shared/reader/article-card/article-card";

import { z } from "zod";
import { createPublicReaderClient } from "@/backend/infrastructure/supabase/public-reader/public-reader";
import { isDraftUuid } from "@/shared/articles/draft-contract/draft-contract";
import { isDatabaseTimestamp } from "@/shared/articles/draft-cursor/draft-cursor";

const slug = z
  .string()
  .min(1)
  .max(180)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const categorySlug = slug.max(120);
const scopeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("latest") }),
  z.strictObject({ kind: z.literal("section"), slug }),
  z.strictObject({
    kind: z.literal("category"),
    section: slug,
    category: categorySlug,
  }),
  z.strictObject({ kind: z.literal("tag"), slug }),
  z.strictObject({ kind: z.literal("author"), slug }),
]);
export type PublicListScope = z.infer<typeof scopeSchema>;
const requestSchema = z.strictObject({
  scope: scopeSchema,
  limit: z.number().int().min(1).max(24).optional(),
  cursor: z.string().min(1).max(1024).optional(),
});
const timestamp = z
  .string()
  .refine(
    (s) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(s) &&
      isDatabaseTimestamp(s),
  );
const uuid = z.string().refine(isDraftUuid);
const cursorSchema = z.strictObject({
  version: z.literal(1),
  scope: z.enum(["latest", "section", "category", "tag", "author"]),
  primary: slug.nullable(),
  secondary: categorySlug.nullable(),
  publishedAt: timestamp,
  id: uuid,
});
type Cursor = z.infer<typeof cursorSchema>;

function filters(scope: PublicListScope) {
  return {
    scope: scope.kind,
    primary:
      scope.kind === "latest"
        ? null
        : scope.kind === "category"
          ? scope.section
          : scope.slug,
    secondary: scope.kind === "category" ? scope.category : null,
  };
}
function matchesScope(cursor: Cursor, scope: PublicListScope) {
  const expected = filters(scope);
  return (
    cursor.scope === expected.scope &&
    cursor.primary === expected.primary &&
    cursor.secondary === expected.secondary
  );
}
function decodeCursor(encoded: string, scope: PublicListScope): Cursor | null {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  try {
    const bytes = Buffer.from(encoded, "base64url");
    if (bytes.toString("base64url") !== encoded) return null;
    const parsed = cursorSchema.safeParse(JSON.parse(bytes.toString("utf8")));
    return parsed.success && matchesScope(parsed.data, scope)
      ? parsed.data
      : null;
  } catch {
    return null;
  }
}

// Match PostgreSQL's Unicode code-point length semantics.
const text = (max: number, min = 0) =>
  z.string().refine((s) => {
    const length = Array.from(s).length;
    return length >= min && length <= max;
  });
const publicPerson = z.strictObject({ displayName: text(120, 1), slug });
const cardSchema = z.strictObject({
  id: uuid,
  slug,
  title: text(240, 1),
  excerpt: text(600).nullable(),
  publishedAt: timestamp,
  section: z.strictObject({ name: text(120, 1), slug: categorySlug }),
  owner: publicPerson,
  writers: z.array(publicPerson).max(32),
  mainImage: z
    .strictObject({
      id: uuid,
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      alt: text(240, 1),
      credit: text(240, 1),
    })
    .nullable(),
});
const responseSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("invalid") }),
  z.strictObject({ kind: z.literal("unavailable") }),
  z.strictObject({
    kind: z.literal("ok"),
    items: z.array(cardSchema).max(24),
    nextCursor: cursorSchema.nullable(),
  }),
]);
export type { PublicArticleCard } from "@/shared/reader/article-card/article-card";
export type PublicListResult =
  | { kind: "invalid" | "unavailable" }
  | { kind: "ok"; items: PublicArticleCard[]; nextCursor: string | null };

export async function listPublicArticles(input: {
  scope: PublicListScope;
  limit?: number;
  cursor?: string;
}): Promise<PublicListResult> {
  const request = requestSchema.safeParse(input);
  if (!request.success) return { kind: "invalid" };
  const { scope, cursor: token, limit = 12 } = request.data;
  const cursor = token ? decodeCursor(token, scope) : null;
  if (token && !cursor) return { kind: "invalid" };
  const filter = filters(scope);
  try {
    const { data, error } = await createPublicReaderClient().rpc(
      "list_public_articles",
      {
        p_scope: filter.scope,
        // Generated Supabase function types omit SQL parameter nullability.
        p_primary: filter.primary as string,
        p_secondary: filter.secondary as string,
        p_limit: limit,
        p_cursor: cursor,
      },
    );
    if (error) return { kind: "unavailable" };
    const parsed = responseSchema.safeParse(data);
    if (!parsed.success) return { kind: "unavailable" };
    if (parsed.data.kind !== "ok") return parsed.data;
    const { items, nextCursor } = parsed.data;
    const last = items.at(-1);
    const earlier = (
      a: { publishedAt: string; id: string },
      b: { publishedAt: string; id: string },
    ) =>
      a.publishedAt < b.publishedAt ||
      (a.publishedAt === b.publishedAt &&
        a.id.toLowerCase() < b.id.toLowerCase());
    if (
      items.length > limit ||
      (cursor && items.length > 0 && !earlier(items[0], cursor)) ||
      items.some(
        (item, index) => index > 0 && !earlier(item, items[index - 1]),
      ) ||
      (nextCursor &&
        (!matchesScope(nextCursor, scope) ||
          items.length !== limit ||
          !last ||
          nextCursor.id !== last.id ||
          nextCursor.publishedAt !== last.publishedAt))
    )
      return { kind: "unavailable" };
    return {
      kind: "ok",
      items,
      nextCursor: nextCursor
        ? Buffer.from(JSON.stringify(nextCursor)).toString("base64url")
        : null,
    };
  } catch {
    return { kind: "unavailable" };
  }
}
