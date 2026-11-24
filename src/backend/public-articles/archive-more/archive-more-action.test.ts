import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  archive: vi.fn(),
  tag: vi.fn(),
  author: vi.fn(),
}));
vi.mock("../public-archive/public-archive", () => ({
  getPublicArchive: mocks.archive,
}));
vi.mock("../public-tag-archive/public-tag-archive", () => ({
  getPublicTagArchive: mocks.tag,
}));
vi.mock("../public-author-archive/public-author-archive", () => ({
  getPublicAuthorArchive: mocks.author,
}));
import { loadMoreArchiveArticles } from "./archive-more-action";

const ok = (href: string) => ({
  kind: "ok",
  archive: { href },
  items: [],
  nextCursor: "next",
  continuation: true,
});
beforeEach(() => vi.clearAllMocks());

it.each([
  [
    "/sections/news",
    () =>
      expect(mocks.archive).toHaveBeenCalledWith("section", "news", "", "c"),
  ],
  [
    "/sections/news/categories/campus",
    () =>
      expect(mocks.archive).toHaveBeenCalledWith(
        "category",
        "news",
        "campus",
        "c",
      ),
  ],
  [
    "/letters",
    () => expect(mocks.archive).toHaveBeenCalledWith("letters", "", "", "c"),
  ],
  ["/tags/bc", () => expect(mocks.tag).toHaveBeenCalledWith("bc", "c")],
  [
    "/authors/jane",
    () => expect(mocks.author).toHaveBeenCalledWith("jane", "c"),
  ],
])("reads the next page of %s", async (href, check) => {
  for (const mock of Object.values(mocks)) mock.mockResolvedValue(ok(href));
  expect(await loadMoreArchiveArticles(href, "c")).toEqual({
    ok: true,
    items: [],
    nextCursor: "next",
  });
  check();
});

it.each([
  "/articles/x",
  "/sections/News",
  "https://evil.test/sections/news",
  "/sections/news?x=1",
  5,
])("refuses an address that is not an archive: %s", async (href) => {
  expect(await loadMoreArchiveArticles(href, "c")).toEqual({ ok: false });
  expect(mocks.archive).not.toHaveBeenCalled();
});

it("refuses a bad cursor and an archive answered under another address", async () => {
  expect(await loadMoreArchiveArticles("/sections/news", "")).toEqual({
    ok: false,
  });
  mocks.archive.mockResolvedValue(ok("/letters"));
  expect(await loadMoreArchiveArticles("/sections/letters", "c")).toEqual({
    ok: false,
  });
  mocks.archive.mockResolvedValue({
    kind: "invalid",
    archive: { href: "/sections/news" },
  });
  expect(await loadMoreArchiveArticles("/sections/news", "c")).toEqual({
    ok: false,
  });
});
