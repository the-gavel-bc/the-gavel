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
import { getPublicAuthorArchive } from "./public-author-archive";
const profile = {
  display_name: "Guest Writer",
  slug: "guest-writer",
  biography: "Public biography\nAnother paragraph",
  photo_updated_at: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ eq: mocks.eq, maybeSingle: mocks.single });
  mocks.single.mockResolvedValue({ data: profile, error: null });
  mocks.list.mockResolvedValue({ kind: "ok", items: [], nextCursor: null });
});
it("projects only public active profile fields and supports empty guest archives", async () => {
  expect(await getPublicAuthorArchive("guest-writer")).toMatchObject({
    kind: "ok",
    author: {
      displayName: "Guest Writer",
      slug: "guest-writer",
      biography: profile.biography,
      photoUrl: null,
    },
    archive: {
      title: "Guest Writer",
      href: "/authors/guest-writer",
      section: null,
    },
    items: [],
  });
  expect(mocks.from).toHaveBeenCalledExactlyOnceWith("profiles");
  expect(mocks.select).toHaveBeenCalledExactlyOnceWith(
    "display_name,slug,biography,photo_updated_at",
  );
  expect(mocks.eq).toHaveBeenCalledWith("slug", "guest-writer");
  expect(mocks.eq).toHaveBeenCalledWith("active", true);
  expect(mocks.list).toHaveBeenCalledExactlyOnceWith({
    scope: { kind: "author", slug: "guest-writer" },
    limit: 12,
  });
});
it("treats malformed, inactive and missing profiles as notFound before listing", async () => {
  for (const slug of ["Bad slug", "", "x".repeat(181)])
    expect(await getPublicAuthorArchive(slug)).toEqual({ kind: "notFound" });
  expect(mocks.from).not.toHaveBeenCalled();
  mocks.single.mockResolvedValue({ data: null, error: null });
  expect(await getPublicAuthorArchive("missing")).toEqual({ kind: "notFound" });
  expect(mocks.list).not.toHaveBeenCalled();
});
it("rejects identity linkage, mismatched slugs, malformed records and private diagnostics", async () => {
  for (const data of [
    { ...profile, auth_user_id: "private" },
    { ...profile, slug: "different" },
    { ...profile, display_name: "" },
    { ...profile, biography: "x".repeat(5001) },
  ]) {
    mocks.single.mockResolvedValue({ data, error: null });
    expect(await getPublicAuthorArchive("guest-writer")).toEqual({
      kind: "unavailable",
    });
  }
  mocks.single.mockResolvedValue({
    data: null,
    error: new Error("private diagnostic"),
  });
  expect(await getPublicAuthorArchive("guest-writer")).toEqual({
    kind: "unavailable",
  });
  mocks.single.mockRejectedValue(new Error("private diagnostic"));
  expect(await getPublicAuthorArchive("guest-writer")).toEqual({
    kind: "unavailable",
  });
  expect(mocks.list).not.toHaveBeenCalled();
});
it("accepts bounded Unicode public fields and nullable biographies", async () => {
  for (const biography of [null, "😀".repeat(5000)]) {
    mocks.single.mockResolvedValue({
      data: { ...profile, display_name: "😀".repeat(120), biography },
      error: null,
    });
    expect(await getPublicAuthorArchive("guest-writer")).toMatchObject({
      kind: "ok",
    });
  }
});
it("binds cursors to the author and preserves unavailable/invalid states", async () => {
  mocks.list
    .mockResolvedValueOnce({ kind: "ok", items: [], nextCursor: "next" })
    .mockResolvedValueOnce({ kind: "invalid" })
    .mockResolvedValueOnce({ kind: "unavailable" });
  expect(await getPublicAuthorArchive("guest-writer", "cursor")).toMatchObject({
    kind: "ok",
    continuation: true,
    nextCursor: "next",
  });
  expect(mocks.list).toHaveBeenLastCalledWith({
    scope: { kind: "author", slug: "guest-writer" },
    limit: 12,
    cursor: "cursor",
  });
  expect(
    await getPublicAuthorArchive("guest-writer", "other-author-token"),
  ).toMatchObject({
    kind: "invalid",
    archive: { href: "/authors/guest-writer" },
  });
  expect(await getPublicAuthorArchive("guest-writer")).toEqual({
    kind: "unavailable",
  });
});
it("rejects repeated, empty and oversized cursors before list calls", async () => {
  for (const cursor of [["one", "two"], "", "a".repeat(1025)])
    expect(await getPublicAuthorArchive("guest-writer", cursor)).toMatchObject({
      kind: "invalid",
    });
  expect(mocks.list).not.toHaveBeenCalled();
});
