import { beforeEach, expect, it, vi } from "vitest";
import { removeUnusedArticleImage } from "./media-removal";

const assetId = "60000000-0000-0000-0000-000000000401";
const userId = "00000000-0000-0000-0000-000000000002";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  userClient: vi.fn(),
  trustedClient: vi.fn(),
  userRpc: vi.fn(),
  trustedRpc: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  storageFrom: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/lib/auth/access/access", () => ({ getCurrentAccess: mocks.access }));
vi.mock("@/lib/supabase/server/server", () => ({
  createServerSupabaseClient: mocks.userClient,
}));
vi.mock("@/lib/supabase/media-admin/media-admin", () => ({
  createTrustedMediaClient: mocks.trustedClient,
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({ status: "active", userId, role: "author" });
  mocks.userClient.mockResolvedValue({ rpc: mocks.userRpc });
  mocks.userRpc.mockResolvedValue({
    data: { ok: true, assetId, replayed: false },
    error: null,
  });
  mocks.trustedClient.mockReturnValue({
    from: mocks.from,
    rpc: mocks.trustedRpc,
    storage: { from: mocks.storageFrom },
  });
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
  mocks.maybeSingle.mockResolvedValue({
    data: { object_key: "opaque/image.webp", status: "deleting" },
    error: null,
  });
  mocks.storageFrom.mockReturnValue({ remove: mocks.remove });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.trustedRpc.mockResolvedValue({
    data: { ok: true, assetId, replayed: false },
    error: null,
  });
});

it("marks through the user client before trusted object deletion and completion", async () => {
  expect(await removeUnusedArticleImage(assetId)).toEqual({
    ok: true,
    assetId,
  });
  expect(mocks.userRpc).toHaveBeenCalledWith("mark_article_image_for_removal", {
    p_asset_id: assetId,
  });
  expect(mocks.remove).toHaveBeenCalledWith(["opaque/image.webp"]);
  expect(mocks.trustedRpc).toHaveBeenCalledWith(
    "complete_article_image_removal",
    {
      p_actor_user_id: userId,
      p_asset_id: assetId,
    },
  );
  expect(mocks.userRpc.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.remove.mock.invocationCallOrder[0],
  );
  expect(mocks.remove.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.trustedRpc.mock.invocationCallOrder[0],
  );
});

it("never opens the trusted client when authorization or reference check fails", async () => {
  mocks.userRpc.mockResolvedValue({
    data: { ok: false, code: "conflict" },
    error: null,
  });
  expect(await removeUnusedArticleImage(assetId)).toEqual({
    ok: false,
    code: "conflict",
  });
  expect(mocks.trustedClient).not.toHaveBeenCalled();
  mocks.access.mockResolvedValue({ status: "signedOut" });
  expect(await removeUnusedArticleImage(assetId)).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(mocks.userClient).toHaveBeenCalledTimes(1);
});

it("leaves a deleting record retryable when object cleanup fails", async () => {
  mocks.remove.mockResolvedValue({ error: new Error("storage unavailable") });
  expect(await removeUnusedArticleImage(assetId)).toEqual({
    ok: false,
    code: "unavailable",
  });
  expect(mocks.trustedRpc).not.toHaveBeenCalled();
});
