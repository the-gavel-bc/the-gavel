import { beforeEach, expect, it, vi } from "vitest";
const search = vi.hoisted(() => vi.fn());
vi.mock("@/backend/public-articles/public-search/public-search", () => ({
  searchPublicArticles: search,
}));
import { GET } from "./route";

const get = (q: string) =>
  GET(new Request(`http://localhost/api/public/search/suggestions?q=${q}`));
beforeEach(() => search.mockReset());

it("returns a few titles with their section and nothing else", async () => {
  search.mockResolvedValue({
    kind: "ok",
    query: "campus",
    nextCursor: "next",
    items: [
      {
        id: "a",
        title: "Campus story",
        slug: "campus-story",
        section: { name: "Features", slug: "features" },
        excerpt: "Private detail is not echoed",
      },
    ],
  });
  const response = await get("campus");
  expect(search).toHaveBeenCalledWith({ query: "campus", limit: 6 });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    kind: "ok",
    items: [
      { title: "Campus story", slug: "campus-story", section: "Features" },
    ],
  });
});

it("maps invalid, rate-limited and unavailable searches to safe statuses", async () => {
  search.mockResolvedValue({ kind: "invalid" });
  expect((await get("")).status).toBe(400);
  search.mockResolvedValue({ kind: "rate_limited", retryAfter: 12 });
  const limited = await get("campus");
  expect(limited.status).toBe(429);
  expect(limited.headers.get("retry-after")).toBe("12");
  expect(limited.headers.get("cache-control")).toBe("private, no-store");
  search.mockResolvedValue({ kind: "unavailable" });
  expect((await get("campus")).status).toBe(503);
});
