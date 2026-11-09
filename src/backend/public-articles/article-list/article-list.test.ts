import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock(
  "@/backend/infrastructure/supabase/public-reader/public-reader",
  () => ({
    createPublicReaderClient: () => ({ rpc: mocks.rpc }),
  }),
);
import { listPublicArticles } from "./article-list";

const scope = { kind: "section", slug: "news" } as const;
const cursor = {
  version: 1,
  scope: "section",
  primary: "news",
  secondary: null,
  publishedAt: "2026-01-01T00:00:00.123456Z",
  id: "53000000-0000-0000-0000-000000000001",
};
const card = {
  id: "53000000-0000-0000-0000-000000000001",
  slug: "story",
  title: "😀".repeat(240),
  excerpt: null,
  publishedAt: cursor.publishedAt,
  section: { name: "News", slug: "news" },
  owner: { displayName: "Writer", slug: "writer" },
  writers: [],
  mainImage: null,
};
describe("listPublicArticles", () => {
  beforeEach(() => vi.resetAllMocks());
  it("returns checked cards and opaque microsecond cursor", async () => {
    mocks.rpc.mockResolvedValue({
      data: { kind: "ok", items: [card], nextCursor: cursor },
      error: null,
    });
    const result = await listPublicArticles({ scope, limit: 1 });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("expected ok");
    expect(result.items).toEqual([card]);
    expect(result.nextCursor).toBeTypeOf("string");
    await listPublicArticles({ scope, limit: 1, cursor: result.nextCursor! });
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      "list_public_articles",
      expect.objectContaining({
        p_scope: "section",
        p_primary: "news",
        p_limit: 1,
        p_cursor: cursor,
      }),
    );
  });
  it("rejects malformed, oversized and cross-scope cursors before RPC", async () => {
    const encoded = Buffer.from(JSON.stringify(cursor)).toString("base64url");
    expect(
      await listPublicArticles({
        scope: { kind: "tag", slug: "news" },
        cursor: encoded,
      }),
    ).toEqual({ kind: "invalid" });
    expect(await listPublicArticles({ scope, cursor: "!" })).toEqual({
      kind: "invalid",
    });
    expect(
      await listPublicArticles({ scope, cursor: "a".repeat(1025) }),
    ).toEqual({ kind: "invalid" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects malformed bounds and invalid dates", async () => {
    const malformed = Buffer.from(
      JSON.stringify({ ...cursor, publishedAt: "2026-02-30T00:00:00.123456Z" }),
    ).toString("base64url");
    expect(await listPublicArticles({ scope, cursor: malformed })).toEqual({
      kind: "invalid",
    });
    expect(await listPublicArticles({ scope, limit: 25 })).toEqual({
      kind: "invalid",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("never returns unexpected private fields or database errors", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: {
          kind: "ok",
          items: [{ ...card, content: { secret: true } }],
          nextCursor: null,
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: new Error("secret") });
    expect(await listPublicArticles({ scope })).toEqual({
      kind: "unavailable",
    });
    expect(await listPublicArticles({ scope })).toEqual({
      kind: "unavailable",
    });
  });
});
