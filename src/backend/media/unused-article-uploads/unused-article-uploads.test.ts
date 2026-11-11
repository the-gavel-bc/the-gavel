import { beforeEach, expect, it, vi } from "vitest";
import { listUnusedArticleUploads } from "./unused-article-uploads";
const articleId = "50000000-0000-0000-0000-000000000401";
const assetId = "60000000-0000-0000-0000-000000000401";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  client: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/backend/auth/access/access", () => ({
  getCurrentAccess: mocks.access,
}));
vi.mock("@/backend/infrastructure/supabase/server/server", () => ({
  createServerSupabaseClient: mocks.client,
}));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({ status: "active" });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({
    data: { ok: true, items: [], nextCursor: null },
    error: null,
  });
});
it("checks access independently and calls bounded caller RPC", async () => {
  expect(await listUnusedArticleUploads(articleId, assetId)).toEqual({
    ok: true,
    items: [],
    nextCursor: null,
  });
  expect(mocks.rpc).toHaveBeenCalledWith("list_unused_article_uploads", {
    p_article_id: articleId,
    p_after_id: assetId,
    p_limit: 25,
  });
});
it("rejects malformed identifiers before authentication", async () => {
  expect(await listUnusedArticleUploads("bad")).toEqual({
    ok: false,
    code: "invalid_input",
  });
  expect(await listUnusedArticleUploads(articleId, "bad")).toEqual({
    ok: false,
    code: "invalid_input",
  });
  expect(mocks.access).not.toHaveBeenCalled();
});
it("denies inactive access without querying", async () => {
  mocks.access.mockResolvedValue({ status: "inactive" });
  expect(await listUnusedArticleUploads(articleId)).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(mocks.client).not.toHaveBeenCalled();
});
it.each([
  {
    ok: true,
    items: [
      {
        assetId,
        createdAt: "2026-11-11T12:00:00+00:00",
        status: "finalized",
        object_key: "private",
      },
    ],
    nextCursor: null,
  },
  { ok: true, items: [], nextCursor: assetId },
  {
    ok: true,
    items: [{ assetId, createdAt: "bad", status: "finalized" }],
    nextCursor: null,
  },
  {
    ok: true,
    items: [
      { assetId, createdAt: "2026-11-11T12:00:00+00:00", status: "uploading" },
    ],
    nextCursor: null,
  },
])("rejects unsafe or nonprogressing output %#", async (data) => {
  mocks.rpc.mockResolvedValue({ data, error: null });
  expect(await listUnusedArticleUploads(articleId)).toEqual({
    ok: false,
    code: "unavailable",
  });
});
it("keeps deleting retries and safe database denials", async () => {
  const data = {
    ok: true,
    items: [
      {
        assetId,
        createdAt: "2026-11-11T12:00:00.123456+00:00",
        status: "deleting",
      },
    ],
    nextCursor: null,
  };
  mocks.rpc.mockResolvedValue({ data, error: null });
  expect(await listUnusedArticleUploads(articleId)).toEqual(data);
  mocks.rpc.mockResolvedValue({
    data: { ok: false, code: "not_found" },
    error: null,
  });
  expect(await listUnusedArticleUploads(articleId)).toEqual({
    ok: false,
    code: "not_found",
  });
});
it("maps transport and access uncertainty to safe failure", async () => {
  mocks.access.mockRejectedValue(new Error("secret"));
  expect(await listUnusedArticleUploads(articleId)).toEqual({
    ok: false,
    code: "unavailable",
  });
});
