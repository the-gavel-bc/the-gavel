import "server-only";
import { cache } from "react";
import { z } from "zod";
import { createPublicReaderClient } from "@/backend/infrastructure/supabase/public-reader/public-reader";
import { publicArticleCardSchema } from "../article-card-schema/article-card-schema";
import { isDraftUuid } from "@/shared/articles/draft-contract/draft-contract";
import { isDatabaseTimestamp } from "@/shared/articles/draft-cursor/draft-cursor";
import {
  normalizePublicSearchQuery,
  type PublicSearchResult,
} from "@/shared/reader/public-search/public-search";

const querySchema = z
  .string()
  .refine((q) => normalizePublicSearchQuery(q) === q);
const cursorSchema = z.strictObject({
  version: z.literal(1),
  query: querySchema,
  publishedAt: z
    .string()
    .refine(
      (s) =>
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(s) &&
        isDatabaseTimestamp(s),
    ),
  id: z.string().refine(isDraftUuid),
});
const requestSchema = z.strictObject({
  query: z.string(),
  limit: z.number().int().min(1).max(24).optional(),
  cursor: z.string().min(1).max(2048).optional(),
});
const responseSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("invalid") }),
  z.strictObject({ kind: z.literal("unavailable") }),
  z.strictObject({
    kind: z.literal("rate_limited"),
    retryAfter: z.number().int().min(1).max(60),
  }),
  z.strictObject({
    kind: z.literal("ok"),
    query: querySchema,
    items: z.array(publicArticleCardSchema).max(24),
    nextCursor: cursorSchema.nullable(),
  }),
]);
function decodeCursor(token: string, query: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return null;
  try {
    const bytes = Buffer.from(token, "base64url");
    const raw = bytes.toString("utf8");
    if (
      bytes.toString("base64url") !== token ||
      !Buffer.from(raw, "utf8").equals(bytes)
    )
      return null;
    const parsed = cursorSchema.safeParse(JSON.parse(raw));
    return parsed.success && parsed.data.query === query ? parsed.data : null;
  } catch {
    return null;
  }
}
// Primitive normalized keys deduplicate only within one server render, so page
// metadata cannot spend a second ticket. New requests still use live no-store RPC.
const readForRequest = cache(
  async (
    query: string,
    limit: number,
    token: string | undefined,
  ): Promise<PublicSearchResult> => {
    const cursor = token ? decodeCursor(token, query) : null;
    if (token && !cursor) return { kind: "invalid" };
    try {
      const { data, error } = await createPublicReaderClient()
        .rpc("search_public_articles", {
          p_query: query,
          p_limit: limit,
          p_cursor: cursor,
        })
        .abortSignal(AbortSignal.timeout(3000));
      if (error) return { kind: "unavailable" };
      const parsed = responseSchema.safeParse(data);
      if (!parsed.success) return { kind: "unavailable" };
      const result = parsed.data;
      if (result.kind !== "ok") return result;
      const { items, nextCursor } = result;
      const last = items.at(-1);
      const earlier = (
        a: { publishedAt: string; id: string },
        b: { publishedAt: string; id: string },
      ) =>
        a.publishedAt < b.publishedAt ||
        (a.publishedAt === b.publishedAt &&
          a.id.toLowerCase() < b.id.toLowerCase());
      if (
        result.query !== query ||
        items.length > limit ||
        (cursor && items[0] && !earlier(items[0], cursor)) ||
        items.some((item, i) => i > 0 && !earlier(item, items[i - 1])) ||
        (nextCursor &&
          (nextCursor.query !== query ||
            items.length !== limit ||
            !last ||
            nextCursor.id !== last.id ||
            nextCursor.publishedAt !== last.publishedAt))
      )
        return { kind: "unavailable" };
      return {
        kind: "ok",
        query,
        items,
        nextCursor: nextCursor
          ? Buffer.from(JSON.stringify(nextCursor)).toString("base64url")
          : null,
      };
    } catch {
      return { kind: "unavailable" };
    }
  },
);
export async function searchPublicArticles(
  input: unknown,
): Promise<PublicSearchResult> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { kind: "invalid" };
  const query = normalizePublicSearchQuery(parsed.data.query);
  if (query === null) return { kind: "invalid" };
  return readForRequest(query, parsed.data.limit ?? 12, parsed.data.cursor);
}

const suggestionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("invalid") }),
  z.strictObject({ kind: z.literal("unavailable") }),
  z.strictObject({
    kind: z.literal("rate_limited"),
    retryAfter: z.number().int().min(1).max(60),
  }),
  z.strictObject({
    kind: z.literal("ok"),
    items: z.array(publicArticleCardSchema).max(6),
  }),
]);
export type PublicSearchSuggestions = z.infer<typeof suggestionSchema>;

// Typeahead: titles containing the typed text, so partial words match. Shares
// the public search budget; see suggest_public_articles.
export async function suggestPublicArticles(
  input: unknown,
): Promise<PublicSearchSuggestions> {
  if (typeof input !== "string") return { kind: "invalid" };
  const query = normalizePublicSearchQuery(input);
  if (query === null || query.length < 3) return { kind: "invalid" };
  try {
    const { data, error } = await createPublicReaderClient()
      .rpc("suggest_public_articles", { p_query: query })
      .abortSignal(AbortSignal.timeout(3000));
    if (error) return { kind: "unavailable" };
    const parsed = suggestionSchema.safeParse(data);
    return parsed.success ? parsed.data : { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
}
