import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("../article-list/article-list", () => ({
  listPublicArticles: mocks.list,
}));
import { getArticleContext } from "./article-context";
const card = (id: string) => ({ id, slug: id });
const ok = (...ids: string[]) => ({
  kind: "ok",
  items: ids.map(card),
  nextCursor: null,
});
beforeEach(() => vi.resetAllMocks());
it("bounds section reads and excludes current and duplicate stories", async () => {
  mocks.list.mockResolvedValue(ok("current", "one", "two", "three"));
  expect(await getArticleContext("current", "news")).toEqual([
    card("one"),
    card("two"),
    card("three"),
  ]);
  expect(mocks.list).toHaveBeenCalledExactlyOnceWith({
    scope: { kind: "section", slug: "news" },
    limit: 4,
  });
});
it("fills short sections with recent unique stories without pagination", async () => {
  mocks.list
    .mockResolvedValueOnce(ok("current", "one", "one"))
    .mockResolvedValueOnce(ok("current", "one", "two", "three"));
  expect(await getArticleContext("current", "news")).toEqual([
    card("one"),
    card("two"),
    card("three"),
  ]);
  expect(mocks.list).toHaveBeenLastCalledWith({
    scope: { kind: "latest" },
    limit: 4,
  });
});
it("isolates related service failure and preserves available section results", async () => {
  mocks.list
    .mockResolvedValueOnce(ok("one"))
    .mockResolvedValueOnce({ kind: "unavailable" });
  expect(await getArticleContext("current", "news")).toEqual([card("one")]);
  mocks.list.mockResolvedValue({ kind: "unavailable" });
  expect(await getArticleContext("current", "news")).toEqual([]);
});
