import { beforeEach, expect, it, vi } from "vitest";
import { requestArticleImageUpload } from "./media-actions";

const articleId = "50000000-0000-0000-0000-000000000401";
const requestId = "80000000-0000-0000-0000-000000000401";
const assetId = "60000000-0000-0000-0000-000000000401";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  client: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/auth/access/access", () => ({ getCurrentAccess: mocks.access }));
vi.mock("@/lib/supabase/server/server", () => ({
  createServerSupabaseClient: mocks.client,
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({ status: "active" });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({
    data: { ok: true, assetId, status: "pending", replayed: false },
    error: null,
  });
});

it("returns a checked reservation from the user-scoped RPC", async () => {
  expect(await requestArticleImageUpload(articleId, requestId)).toEqual({
    ok: true,
    assetId,
    status: "pending",
    replayed: false,
  });
  expect(mocks.rpc).toHaveBeenCalledWith("request_article_image_upload", {
    p_article_id: articleId,
    p_request_id: requestId,
  });
});

it("rejects invalid IDs before checking access", async () => {
  expect(await requestArticleImageUpload("forged", requestId)).toEqual({
    ok: false,
    code: "invalid_input",
  });
  expect(mocks.access).not.toHaveBeenCalled();
});

it("denies a signed-out caller before opening a database client", async () => {
  mocks.access.mockResolvedValue({ status: "signedOut" });
  expect(await requestArticleImageUpload(articleId, requestId)).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(mocks.client).not.toHaveBeenCalled();
});

it("returns a safe failure for malformed database output", async () => {
  mocks.rpc.mockResolvedValue({
    data: { ok: true, assetId, status: "pending", secret: "private" },
    error: null,
  });
  expect(await requestArticleImageUpload(articleId, requestId)).toEqual({
    ok: false,
    code: "unavailable",
  });
});
