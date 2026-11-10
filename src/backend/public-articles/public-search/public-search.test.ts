import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), abort: vi.fn() }));
vi.mock(
  "@/backend/infrastructure/supabase/public-reader/public-reader",
  () => ({ createPublicReaderClient: () => ({ rpc: mocks.rpc }) }),
);
import { searchPublicArticles } from "./public-search";
const q = "Boston College";
const card = {
  id: "5d000000-0000-0000-0000-000000000001",
  slug: "public-story",
  title: "Public story",
  excerpt: null,
  publishedAt: "2026-11-10T00:00:00.123456Z",
  section: { name: "News", slug: "news" },
  owner: { displayName: "Writer", slug: "writer" },
  writers: [],
  mainImage: null,
};
const cursor = {
  version: 1,
  query: q,
  publishedAt: card.publishedAt,
  id: card.id,
};
const ok = (items: unknown[] = [], nextCursor: unknown = null) => ({
  data: { kind: "ok", query: q, items, nextCursor },
  error: null,
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.rpc.mockReturnValue({ abortSignal: mocks.abort });
  mocks.abort.mockResolvedValue(ok());
});
it("uses normalized query, bounded defaults and a transport abort signal with the anonymous RPC", async () => {
  expect(
    await searchPublicArticles({ query: " \tBoston\u00a0College\n" }),
  ).toEqual({ kind: "ok", query: q, items: [], nextCursor: null });
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("search_public_articles", {
    p_query: q,
    p_limit: 12,
    p_cursor: null,
  });
  expect(mocks.abort).toHaveBeenCalledOnce();
  expect(mocks.abort.mock.calls[0][0].aborted).toBe(false);
});
it("encodes strict microsecond cursors and binds them to the complete normalized query", async () => {
  mocks.abort
    .mockResolvedValueOnce(ok([card], cursor))
    .mockResolvedValueOnce(ok());
  const first = await searchPublicArticles({ query: q, limit: 1 });
  if (first.kind !== "ok" || !first.nextCursor) throw Error("Expected cursor");
  await searchPublicArticles({ query: q, limit: 1, cursor: first.nextCursor });
  expect(mocks.rpc).toHaveBeenLastCalledWith("search_public_articles", {
    p_query: q,
    p_limit: 1,
    p_cursor: cursor,
  });
  expect(
    await searchPublicArticles({
      query: "Different query",
      cursor: first.nextCursor,
    }),
  ).toEqual({ kind: "invalid" });
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
});
it("rejects bad limits, repeated/forged cursors and caller-controlled quota fields before RPC", async () => {
  for (const input of [
    { query: "" },
    { query: "x".repeat(161) },
    { query: q, limit: 25 },
    { query: q, actorId: "fake" },
    { query: q, budget: 999 },
    { query: q, cursor: ["a", "b"] },
    { query: q, cursor: "!invalid" },
    { query: q, cursor: "a".repeat(2049) },
  ])
    expect(await searchPublicArticles(input)).toEqual({ kind: "invalid" });
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("rejects unexpected private fields, query mismatch and malformed retry hints", async () => {
  for (const data of [
    {
      kind: "ok",
      query: q,
      items: [{ ...card, body: "private" }],
      nextCursor: null,
    },
    { kind: "ok", query: "Other", items: [], nextCursor: null },
    { kind: "rate_limited", retryAfter: 61 },
    { kind: "rate_limited", retryAfter: -1 },
    { kind: "unavailable", diagnostic: "private" },
  ]) {
    mocks.abort.mockResolvedValue({ data, error: null });
    expect(await searchPublicArticles({ query: q })).toEqual({
      kind: "unavailable",
    });
  }
});
it("returns bounded rate-limit/invalid states and hides transport failures", async () => {
  mocks.abort
    .mockResolvedValueOnce({
      data: { kind: "rate_limited", retryAfter: 60 },
      error: null,
    })
    .mockResolvedValueOnce({ data: { kind: "invalid" }, error: null })
    .mockResolvedValueOnce({ data: null, error: new Error("private") })
    .mockRejectedValueOnce(new Error("abort"));
  expect(await searchPublicArticles({ query: q })).toEqual({
    kind: "rate_limited",
    retryAfter: 60,
  });
  expect(await searchPublicArticles({ query: q })).toEqual({ kind: "invalid" });
  expect(await searchPublicArticles({ query: q })).toEqual({
    kind: "unavailable",
  });
  expect(await searchPublicArticles({ query: q })).toEqual({
    kind: "unavailable",
  });
});
it("rejects duplicate/out-of-order cards and cursors that do not describe the final full page", async () => {
  for (const response of [
    ok([card, card]),
    ok([card, { ...card, id: "5d000000-0000-0000-0000-000000000002" }]),
    ok([card], { ...cursor, id: "5d000000-0000-0000-0000-000000000099" }),
    ok([], cursor),
  ]) {
    mocks.abort.mockResolvedValue(response);
    expect(await searchPublicArticles({ query: q, limit: 1 })).toEqual({
      kind: "unavailable",
    });
  }
});
