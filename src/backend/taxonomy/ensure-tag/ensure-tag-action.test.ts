import { beforeEach, expect, it, vi } from "vitest";
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
import { ensureTagAction } from "./ensure-tag-action";
const row = {
  ok: true,
  id: "81000000-0000-0000-0000-000000000001",
  name: "Campus news",
  slug: "campus-news",
  created: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ status: "active", role: "author" });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: row, error: null });
});
it("allows active authors and sends the normalized name", async () => {
  expect(await ensureTagAction("  Campus\tnews ")).toEqual(row);
  expect(mocks.rpc).toHaveBeenCalledWith("ensure_tag", {
    p_name: "Campus news",
  });
});
it("rejects invalid input without querying", async () => {
  expect(await ensureTagAction(" ")).toEqual({
    ok: false,
    code: "invalid_input",
  });
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("blocks signed out and pending callers", async () => {
  for (const status of ["signedOut", "pending"]) {
    mocks.access.mockResolvedValue({ status });
    expect(await ensureTagAction("Campus news")).toEqual({
      ok: false,
      code: "forbidden",
    });
  }
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("preserves database denial and masks errors or malformed rows", async () => {
  mocks.rpc.mockResolvedValueOnce({
    data: { ok: false, code: "rate_limited" },
    error: null,
  });
  expect(await ensureTagAction("Campus news")).toEqual({
    ok: false,
    code: "rate_limited",
  });
  mocks.rpc.mockResolvedValueOnce({ data: row, error: { message: "private" } });
  expect(await ensureTagAction("Campus news")).toEqual({
    ok: false,
    code: "unavailable",
  });
  mocks.rpc.mockResolvedValueOnce({
    data: { ...row, id: "not-uuid" },
    error: null,
  });
  expect(await ensureTagAction("Campus news")).toEqual({
    ok: false,
    code: "unavailable",
  });
  mocks.rpc.mockRejectedValueOnce(new Error("private"));
  expect(await ensureTagAction("Campus news")).toEqual({
    ok: false,
    code: "unavailable",
  });
});
