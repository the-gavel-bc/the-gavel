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
const article = (n: number) => ({
  id: id(n),
  slug: `story-${n}`,
  publishedAt: "2026-11-01T12:00:00.123456Z",
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
    submissionInstructions: instructions,
  },
});
const archives = {
  kind: "ok",
  sections: ["letter-to-the-editor", "news"],
  categories: [{ section: "news", slug: "campus" }],
  tags: ["housing"],
  authors: ["guest-writer"],
};
function respond(pages: unknown[], archiveData: unknown = archives) {
  mocks.rpc.mockImplementation(async (name: string) =>
    name === "list_public_sitemap_archives"
      ? { data: archiveData, error: null }
      : { data: pages.shift(), error: null },
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.site.mockResolvedValue(site("Our mission.", "Send letters."));
});

it("lists canonical non-empty public pages from validated SITE_URL", async () => {
  respond([{ kind: "ok", items: [article(1)], hasMore: false }]);
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
      {
        url: "https://gavel.example/articles/story-1",
        lastModified: "2026-11-01T12:00:00.123456Z",
      },
    ],
  });
  expect(mocks.rpc).toHaveBeenCalledWith("list_public_sitemap_articles", {
    p_after_published_at: null,
    p_after_id: null,
    p_limit: 1000,
  });
});

it("omits informational pages without primary copy", async () => {
  mocks.site.mockResolvedValue(site("  ", null));
  respond([{ kind: "ok", items: [], hasMore: false }], {
    ...archives,
    sections: ["news"],
  });
  const result = await getPublicSitemap();
  expect(result.kind === "ok" && result.entries.map((e) => e.url)).toEqual([
    "https://gavel.example/",
    "https://gavel.example/sections/news",
    "https://gavel.example/sections/news/categories/campus",
    "https://gavel.example/tags/housing",
    "https://gavel.example/authors/guest-writer",
  ]);
});

it("pages articles by keyset until the projection reports no more", async () => {
  const first = Array.from({ length: 1000 }, (_, n) => article(n + 1));
  respond([
    { kind: "ok", items: first, hasMore: true },
    { kind: "ok", items: [article(1001)], hasMore: false },
  ]);
  const result = await getPublicSitemap();
  expect(result.kind === "ok" && result.entries.length).toBe(1009);
  expect(mocks.rpc).toHaveBeenLastCalledWith("list_public_sitemap_articles", {
    p_after_published_at: "2026-11-01T12:00:00.123456Z",
    p_after_id: id(1000),
    p_limit: 1000,
  });
});

it("fails closed instead of truncating past the protocol limit", async () => {
  const page = Array.from({ length: 1000 }, (_, n) => article(n + 1));
  mocks.rpc.mockImplementation(async (name: string) =>
    name === "list_public_sitemap_archives"
      ? { data: archives, error: null }
      : { data: { kind: "ok", items: page, hasMore: true }, error: null },
  );
  expect(await getPublicSitemap()).toEqual({ kind: "unavailable" });
  expect(mocks.rpc.mock.calls.length).toBeLessThanOrEqual(52);
});

it.each([
  [
    "navigation unavailable",
    () => mocks.site.mockResolvedValue({ kind: "unavailable" }),
  ],
  ["archives unavailable", () => respond([], { kind: "unavailable" })],
  [
    "unsafe archive slug",
    () => respond([], { ...archives, tags: ["../dashboard"] }),
  ],
  ["extra archive field", () => respond([], { ...archives, secret: true })],
  ["invalid article page", () => respond([{ kind: "invalid" }])],
  [
    "unsafe article slug",
    () =>
      respond([
        { kind: "ok", items: [{ ...article(1), slug: "a/b" }], hasMore: false },
      ]),
  ],
  [
    "short page claiming more",
    () => respond([{ kind: "ok", items: [article(1)], hasMore: true }]),
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
  respond([{ kind: "ok", items: [], hasMore: false }]);
  arrange();
  expect(await getPublicSitemap()).toEqual({ kind: "unavailable" });
});
