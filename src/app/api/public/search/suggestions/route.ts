import { suggestPublicArticles } from "@/backend/public-articles/public-search/public-search";

export const dynamic = "force-dynamic";
const json = (body: unknown, status: number, headers: HeadersInit = {}) =>
  Response.json(body, {
    status,
    headers: { "X-Content-Type-Options": "nosniff", ...headers },
  });
const noStore = { "Cache-Control": "private, no-store" };

// Typeahead for the navigation search: up to six published titles containing
// the typed text, so partial words match. It spends the same bounded public
// search budget as /search; the client debounces so a typed query costs about
// one search. Identical queries are briefly cacheable to absorb repeats.
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const result = await suggestPublicArticles(query);
  if (result.kind === "invalid") return json({ kind: "invalid" }, 400, noStore);
  if (result.kind === "rate_limited")
    return json({ kind: "rate_limited" }, 429, {
      ...noStore,
      "Retry-After": String(result.retryAfter),
    });
  if (result.kind !== "ok") return json({ kind: "unavailable" }, 503, noStore);
  return json(
    {
      kind: "ok",
      items: result.items.map((item) => ({
        title: item.title,
        slug: item.slug,
        section: item.section.name,
      })),
    },
    200,
    { "Cache-Control": "public, max-age=30, s-maxage=30" },
  );
}
