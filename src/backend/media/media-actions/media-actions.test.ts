import { beforeEach, expect, it, vi } from "vitest";
import {
  requestArticleImageUpload,
  setArticleMainImage,
} from "./media-actions";

const articleId = "50000000-0000-0000-0000-000000000401";
const requestId = "80000000-0000-0000-0000-000000000401";
const assetId = "60000000-0000-0000-0000-000000000401";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  client: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/backend/auth/access/access", () => ({
  getCurrentAccess: mocks.access,
}));
vi.mock("@/backend/infrastructure/supabase/server/server", () => ({
  createServerSupabaseClient: mocks.client,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

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

const imageCommand = {
  articleId,
  expectedVersion: 2,
  requestId,
  assetId,
  altText: "Newsroom graphic",
  credit: "The Gavel",
};
const imageReceipt = {
  ok: true,
  articleId,
  version: 3,
  updatedAt: "2026-11-03T12:00:00.000Z",
  replayed: false,
  changed: true,
};

it("attaches a validated image through the user-scoped versioned RPC", async () => {
  mocks.rpc.mockResolvedValue({ data: imageReceipt, error: null });
  expect(await setArticleMainImage(imageCommand)).toEqual(imageReceipt);
  expect(mocks.rpc).toHaveBeenCalledWith("set_article_main_image", {
    p_article_id: articleId,
    p_expected_version: 2,
    p_request_id: requestId,
    p_asset_id: assetId,
    p_alt_text: "Newsroom graphic",
    p_credit: "The Gavel",
  });
  expect(mocks.revalidate).toHaveBeenCalledWith(
    `/dashboard/articles/${articleId}`,
  );
});

it("rejects forged fields and blank accessibility metadata before access", async () => {
  expect(
    await setArticleMainImage({ ...imageCommand, actorUserId: articleId }),
  ).toEqual({
    ok: false,
    code: "invalid_input",
  });
  expect(await setArticleMainImage({ ...imageCommand, altText: " " })).toEqual({
    ok: false,
    code: "invalid_input",
  });
  expect(mocks.access).not.toHaveBeenCalled();
});

it("maps a transport failure to an uncertain result without retrying", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: "private" } });
  expect(await setArticleMainImage(imageCommand)).toEqual({
    ok: false,
    code: "unavailable",
  });
  expect(mocks.rpc).toHaveBeenCalledOnce();
});
