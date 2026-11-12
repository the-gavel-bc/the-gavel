import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), site: vi.fn() }));
vi.mock("@/backend/infrastructure/env/server/server", () => ({
  getServerEnv: () => ({ SITE_URL: "https://gavel.example" }),
}));
vi.mock(
  "@/backend/infrastructure/supabase/public-reader/public-reader",
  () => ({ createPublicReaderClient: () => ({ rpc: mocks.rpc }) }),
);
vi.mock(
  "@/backend/public-site/public-site-navigation/public-site-navigation",
  () => ({ getPublicSiteNavigation: mocks.site }),
);
import { getPublicSitemap } from "./public-sitemap";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const article = (n: number, overrides = {}) => ({
  id: id(n),
  slug: `story-${n}`,
  publishedAt: "2026-11-01T12:00:00.123456Z",
  section: "news",
  categories: [],
  tags: [],
  authors: ["owner"],
  ...overrides,
});
const site = (mission: string | null, instructions: string | null) => ({
  kind: "ok",
  sections: [
    { name: "News", slug: "news", categories: [] },
    {
      name: "Letter to the Editor",
      slug: "letter-to-the-editor",
      categories: [],
    },
  ],
  information: {
    mission,
    contactEmail: null,
    instagramUrl: null,
    spotifyUrl: null,
    linkedinUrl: null,
    facebookUrl: null,
    submissionInstructions: instructions,
  },
});
function respond(...pages: unknown[]) {
  mocks.rpc.mockImplementation(async () => ({
    data: pages.shift(),
    error: null,
  }));
}
const urls = async () => {
  const result = await getPublicSitemap();
  return result.kind === "ok" ? result.entries.map((e) => e.url) : result;
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.site.mockResolvedValue(site("Our mission.", "Send letters."));
});

it("derives non-empty archives from listed articles on validated SITE_URL", async () => {
  respond({
    kind: "ok",
    items: [
      article(1, {
        categories: ["campus"],
        tags: ["housing"],
        authors: ["guest-writer", "owner"],
      }),
      article(2, { section: "letter-to-the-editor", tags: ["housing"] }),
    ],
    hasMore: false,
  });
  expect(await getPublicSitemap()).toEqual({
    kind: "ok",
    entries: [
      { url: "https://gavel.example/" },
      { url: "https://gavel.example/about" },
      { url: "https://gavel.example/letters/how-to-submit" },
      { url: "https://gavel.example/letters" },
      { url: "https://gavel.example/sections/news" },
      { url: "https://gavel.example/sections/news/categories/campus" },
      { url: "https://gavel.example/tags/housing" },
      { url: "https://gavel.example/authors/guest-writer" },
      { url: "https://gavel.example/authors/owner" },
      {
        url: "https://gavel.example/articles/story-1",
        lastModified: "2026-11-01T12:00:00.123456Z",
      },
      {
        url: "https://gavel.example/articles/story-2",
        lastModified: "2026-11-01T12:00:00.123456Z",
      },
    ],
  });
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
    "list_public_sitemap_articles",
    { p_after_published_at: null, p_after_id: null, p_limit: 1000 },
  );
});

it("omits informational pages without primary copy", async () => {
  mocks.site.mockResolvedValue(site("  ", null));
  respond({ kind: "ok", items: [], hasMore: false });
  expect(await urls()).toEqual(["https://gavel.example/"]);
});

it("keeps articles and archives when navigation is unavailable", async () => {
  mocks.site.mockResolvedValue({ kind: "unavailable" });
  respond({
    kind: "ok",
    items: [article(1, { section: "letter-to-the-editor" })],
    hasMore: false,
  });
  expect(await urls()).toEqual([
    "https://gavel.example/",
    "https://gavel.example/sections/letter-to-the-editor",
    "https://gavel.example/authors/owner",
    "https://gavel.example/articles/story-1",
  ]);
});

it("pages by keyset and lists an article seen on two pages once", async () => {
  const first = Array.from({ length: 1000 }, (_, n) => article(n + 1));
  respond(
    { kind: "ok", items: first, hasMore: true },
    { kind: "ok", items: [article(1000), article(1001)], hasMore: false },
  );
  const result = await urls();
  // "/", about, how-to-submit, one section, one author, 1001 articles.
  expect(Array.isArray(result) && result.length).toBe(1006);
  expect(mocks.rpc).toHaveBeenLastCalledWith("list_public_sitemap_articles", {
    p_after_published_at: "2026-11-01T12:00:00.123456Z",
    p_after_id: id(1000),
    p_limit: 1000,
  });
});

it("passes the shared budget's retry time through", async () => {
  respond(
    {
      kind: "ok",
      items: Array.from({ length: 1000 }, (_, n) => article(n)),
      hasMore: true,
    },
    { kind: "rate_limited", retryAfter: 17 },
  );
  expect(await getPublicSitemap()).toEqual({
    kind: "rate_limited",
    retryAfter: 17,
  });
});

it("fails closed instead of truncating past the protocol limit", async () => {
  let n = 0;
  mocks.rpc.mockImplementation(async () => ({
    data: {
      kind: "ok",
      items: Array.from({ length: 1000 }, () => article(++n)),
      hasMore: true,
    },
    error: null,
  }));
  expect(await getPublicSitemap()).toEqual({ kind: "unavailable" });
  expect(mocks.rpc.mock.calls.length).toBeLessThanOrEqual(51);
});

it.each([
  ["invalid article page", () => respond({ kind: "invalid" })],
  [
    "unsafe article slug",
    () =>
      respond({
        kind: "ok",
        items: [article(1, { slug: "a/b" })],
        hasMore: false,
      }),
  ],
  [
    "unsafe archive slug",
    () =>
      respond({
        kind: "ok",
        items: [article(1, { tags: ["../dashboard"] })],
        hasMore: false,
      }),
  ],
  [
    "oversized association list",
    () =>
      respond({
        kind: "ok",
        items: [
          article(1, { tags: Array.from({ length: 65 }, (_, i) => `t${i}`) }),
        ],
        hasMore: false,
      }),
  ],
  [
    "extra article field",
    () =>
      respond({
        kind: "ok",
        items: [article(1, { secret: true })],
        hasMore: false,
      }),
  ],
  [
    "short page claiming more",
    () => respond({ kind: "ok", items: [article(1)], hasMore: true }),
  ],
  [
    "database error",
    () =>
      mocks.rpc.mockResolvedValue({
        data: null,
        error: { message: "internal detail" },
      }),
  ],
  ["client throws", () => mocks.rpc.mockRejectedValue(new Error("network"))],
])("returns a generic unavailable result for %s", async (_, arrange) => {
  arrange();
  expect(await getPublicSitemap()).toEqual({ kind: "unavailable" });
});
