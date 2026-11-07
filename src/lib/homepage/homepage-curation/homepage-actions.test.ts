import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  client: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/lib/auth/access/access", () => ({ getCurrentAccess: mocks.access }));
vi.mock("@/lib/supabase/server/server", () => ({
  createServerSupabaseClient: mocks.client,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { saveHomepageAction } from "./homepage-actions";
const id = "83000000-0000-0000-0000-000000000001";
const command = {
  requestId: id,
  expectedVersion: 1,
  lead: null,
  featured: [],
  readThis: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ status: "active", role: "administrator" });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
});
it("passes only validated IDs and version to user-scoped RPC", async () => {
  const result = { ok: true, version: 1, changed: false, replayed: false };
  mocks.rpc.mockResolvedValue({ data: result, error: null });
  expect(await saveHomepageAction(command)).toEqual(result);
  expect(mocks.rpc).toHaveBeenCalledWith("save_homepage_selections", {
    p_request_id: id,
    p_expected_version: 1,
    p_lead: null,
    p_featured: [],
    p_read_this: [],
  });
});
it("blocks authors and masks transport errors", async () => {
  mocks.access.mockResolvedValueOnce({ status: "active", role: "author" });
  expect(await saveHomepageAction(command)).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(mocks.rpc).not.toHaveBeenCalled();
  mocks.rpc.mockResolvedValue({ data: null, error: { message: "private" } });
  expect(await saveHomepageAction(command)).toEqual({
    ok: false,
    code: "unavailable",
  });
});
