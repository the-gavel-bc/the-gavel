import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
  list: vi.fn(),
}));
vi.mock(
  "@/backend/infrastructure/supabase/public-reader/public-reader",
  () => ({ createPublicReaderClient: () => ({ from: mocks.from }) }),
);
vi.mock("../article-list/article-list", () => ({
  listPublicArticles: mocks.list,
}));
import { getPublicTagArchive } from "./public-tag-archive";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ maybeSingle: mocks.single });
  mocks.single.mockResolvedValue({
    data: { name: "Campus life", slug: "campus-life" },
    error: null,
  });
  mocks.list.mockResolvedValue({
    kind: "ok",
    items: [{ id: "story" }],
    nextCursor: null,
  });
});
it("resolves an allowlisted tag with public stories", async () => {
  expect(await getPublicTagArchive("campus-life")).toMatchObject({
    kind: "ok",
    archive: {
      title: "Campus life",
      section: null,
      category: null,
      isLetters: false,
      href: "/tags/campus-life",
    },
    items: [{ id: "story" }],
    continuation: false,
  });
  expect(mocks.from).toHaveBeenCalledExactlyOnceWith("tags");
  expect(mocks.select).toHaveBeenCalledExactlyOnceWith("name,slug");
  expect(mocks.eq).toHaveBeenCalledExactlyOnceWith("slug", "campus-life");
  expect(mocks.list).toHaveBeenCalledExactlyOnceWith({
    scope: { kind: "tag", slug: "campus-life" },
    limit: 12,
  });
});
it("does not read data for malformed slugs and does not list unknown tags", async () => {
  for (const slug of ["Bad slug", "", "x".repeat(121)])
    expect(await getPublicTagArchive(slug)).toEqual({ kind: "notFound" });
  expect(mocks.from).not.toHaveBeenCalled();
  mocks.single.mockResolvedValue({ data: null, error: null });
  expect(await getPublicTagArchive("missing")).toEqual({ kind: "notFound" });
  expect(mocks.list).not.toHaveBeenCalled();
});
it("hides malformed responses, wrong identity, database errors and thrown diagnostics", async () => {
  for (const data of [
    { name: "Campus life", slug: "different" },
    { name: "Campus life", slug: "campus-life", internal: "private" },
    { name: "", slug: "campus-life" },
  ]) {
    mocks.single.mockResolvedValue({ data, error: null });
    expect(await getPublicTagArchive("campus-life")).toEqual({
      kind: "unavailable",
    });
  }
  mocks.single.mockResolvedValue({
    data: null,
    error: new Error("private diagnostic"),
  });
  expect(await getPublicTagArchive("campus-life")).toEqual({
    kind: "unavailable",
  });
  mocks.single.mockRejectedValue(new Error("private diagnostic"));
  expect(await getPublicTagArchive("campus-life")).toEqual({
    kind: "unavailable",
  });
  expect(mocks.list).not.toHaveBeenCalled();
});
it("preserves Unicode code-point names within the catalog limit", async () => {
  mocks.single.mockResolvedValue({
    data: { name: "😀".repeat(120), slug: "campus-life" },
    error: null,
  });
  expect(await getPublicTagArchive("campus-life")).toMatchObject({
    kind: "ok",
  });
});
it("forwards only scoped bounded cursor requests and preserves safe recovery", async () => {
  mocks.list
    .mockResolvedValueOnce({ kind: "ok", items: [], nextCursor: "next-token" })
    .mockResolvedValueOnce({ kind: "invalid" })
    .mockResolvedValueOnce({ kind: "unavailable" });
  expect(await getPublicTagArchive("campus-life", "token")).toMatchObject({
    kind: "ok",
    continuation: true,
    nextCursor: "next-token",
  });
  expect(mocks.list).toHaveBeenLastCalledWith({
    scope: { kind: "tag", slug: "campus-life" },
    limit: 12,
    cursor: "token",
  });
  expect(
    await getPublicTagArchive("campus-life", "other-tag-token"),
  ).toMatchObject({ kind: "invalid", archive: { href: "/tags/campus-life" } });
  expect(await getPublicTagArchive("campus-life")).toEqual({
    kind: "unavailable",
  });
});
it("rejects repeated, empty and oversized cursors before listing", async () => {
  for (const cursor of [["one", "two"], "", "a".repeat(1025)])
    expect(await getPublicTagArchive("campus-life", cursor)).toMatchObject({
      kind: "invalid",
    });
  expect(mocks.list).not.toHaveBeenCalled();
});

it("hides the tag when the last public article disappears after label lookup", async () => {
  mocks.list.mockResolvedValue({ kind: "ok", items: [], nextCursor: null });
  expect(await getPublicTagArchive("campus-life")).toEqual({
    kind: "notFound",
  });
});
