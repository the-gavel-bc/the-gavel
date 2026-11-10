import type { PublicArticleCard } from "../article-card/article-card";

// Keep this explicit Unicode set identical to private.normalize_search_query.
const whitespace =
  /[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+/gu;
export function normalizePublicSearchQuery(input: unknown): string | null {
  if (
    typeof input !== "string" ||
    Array.from(input).length > 512 ||
    new TextEncoder().encode(input).length > 2048
  )
    return null;
  if (
    Array.from(input).some((c) => {
      const n = c.codePointAt(0)!;
      return n >= 0xd800 && n <= 0xdfff;
    })
  )
    return null;
  const query = input.replace(whitespace, " ").replace(/^ +| +$/g, "");
  return query.length > 0 &&
    Array.from(query).length <= 160 &&
    !/[\u0000-\u001f\u007f-\u009f]/u.test(query)
    ? query
    : null;
}
export type PublicSearchResult =
  | { kind: "invalid" }
  | { kind: "unavailable" }
  | { kind: "rate_limited"; retryAfter: number }
  | {
      kind: "ok";
      query: string;
      items: PublicArticleCard[];
      nextCursor: string | null;
    };
