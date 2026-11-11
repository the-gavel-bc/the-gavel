import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ catalog: vi.fn(), list: vi.fn() }));
vi.mock(
  "@/backend/public-site/public-site-navigation/public-site-navigation",
  () => ({ getPublicSiteNavigationForRequest: mocks.catalog }),
);
vi.mock("../article-list/article-list", () => ({
  listPublicArticles: mocks.list,
}));
import { getPublicArchive } from "./public-archive";
const news = {
  name: "News",
  slug: "news",
  categories: [{ name: "Campus news", slug: "campus" }],
};
const sports = {
  name: "Sports",
  slug: "sports",
  categories: [{ name: "Campus sports", slug: "campus" }],
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.catalog.mockResolvedValue({ kind: "ok", sections: [news, sports] });
  mocks.list.mockResolvedValue({ kind: "ok", items: [], nextCursor: null });
});
it("resolves empty active archives distinctly from missing or unavailable catalogs", async () => {
  expect(await getPublicArchive("section", "news", "")).toMatchObject({
    kind: "ok",
    items: [],
    archive: { title: "News", href: "/sections/news" },
  });
  expect(await getPublicArchive("section", "missing", "")).toEqual({
    kind: "notFound",
  });
  mocks.catalog.mockResolvedValue({ kind: "unavailable" });
  expect(await getPublicArchive("section", "news", "")).toEqual({
    kind: "unavailable",
  });
});
it("binds equal category slugs to their active parents", async () => {
  expect(await getPublicArchive("category", "news", "campus")).toMatchObject({
    kind: "ok",
    archive: { title: "Campus news", href: "/sections/news/categories/campus" },
  });
  expect(mocks.list).toHaveBeenLastCalledWith({
    scope: { kind: "category", section: "news", category: "campus" },
    limit: 12,
  });
  expect(await getPublicArchive("category", "sports", "campus")).toMatchObject({
    kind: "ok",
    archive: { title: "Campus sports" },
  });
  expect(await getPublicArchive("category", "news", "missing")).toEqual({
    kind: "notFound",
  });
  expect(await getPublicArchive("category", "missing", "campus")).toEqual({
    kind: "notFound",
  });
});
it("forwards opaque cursors only into the resolved scope and preserves final pages", async () => {
  mocks.list.mockResolvedValue({ kind: "ok", items: [], nextCursor: null });
  expect(
    await getPublicArchive("section", "news", "", "opaque-token"),
  ).toMatchObject({ kind: "ok", continuation: true, nextCursor: null });
  expect(mocks.list).toHaveBeenLastCalledWith({
    scope: { kind: "section", slug: "news" },
    cursor: "opaque-token",
    limit: 12,
  });
  mocks.list.mockResolvedValue({ kind: "invalid" });
  expect(
    await getPublicArchive("section", "sports", "", "opaque-token"),
  ).toMatchObject({ kind: "invalid", archive: { href: "/sections/sports" } });
});
it("rejects repeated and oversized cursors before list reads", async () => {
  for (const cursor of [["one", "two"], "", "a".repeat(1025)])
    expect(await getPublicArchive("section", "news", "", cursor)).toMatchObject(
      { kind: "invalid" },
    );
  expect(mocks.list).not.toHaveBeenCalled();
});
it("isolates list failure and does not query missing catalog scopes", async () => {
  await getPublicArchive("category", "news", "missing");
  expect(mocks.list).not.toHaveBeenCalled();
  mocks.list.mockResolvedValue({ kind: "unavailable" });
  expect(await getPublicArchive("section", "news", "")).toEqual({
    kind: "unavailable",
  });
});
it("maps letters through the approved label without assuming a database slug", async () => {
  mocks.catalog.mockResolvedValue({
    kind: "ok",
    sections: [
      {
        name: "Letter to the Editor",
        slug: "configured-editor-letters",
        categories: [],
      },
    ],
  });
  expect(await getPublicArchive("letters", "", "")).toMatchObject({
    kind: "ok",
    archive: {
      href: "/letters",
      isLetters: true,
      title: "Letter to the Editor",
    },
  });
  expect(mocks.list).toHaveBeenCalledExactlyOnceWith({
    scope: { kind: "section", slug: "configured-editor-letters" },
    limit: 12,
  });
  expect(
    await getPublicArchive("section", "configured-editor-letters", ""),
  ).toMatchObject({
    kind: "ok",
    archive: { href: "/letters", isLetters: true },
  });
  mocks.catalog.mockResolvedValue({ kind: "ok", sections: [news] });
  expect(await getPublicArchive("letters", "", "")).toEqual({
    kind: "unavailable",
  });
});

it("preserves a letters category URL rather than appending it to the letters root", async () => {
  const section = {
    name: "Letter to the Editor",
    slug: "configured-letters",
    categories: [{ name: "Campus", slug: "campus" }],
  };
  mocks.catalog.mockResolvedValue({ kind: "ok", sections: [section] });
  expect(
    await getPublicArchive("category", section.slug, "campus"),
  ).toMatchObject({
    kind: "ok",
    archive: {
      href: "/sections/configured-letters/categories/campus",
      isLetters: true,
    },
  });
});
