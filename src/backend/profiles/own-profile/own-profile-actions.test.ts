import { beforeEach, expect, it, vi } from "vitest";
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
import { saveOwnProfileAction } from "./own-profile-actions";
const id = "82000000-0000-0000-0000-000000000001";
const command = {
  requestId: id,
  expectedVersion: 1,
  displayName: "Writer",
  biography: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ status: "active", profileId: id });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
});
it("sends only public fields to the own-profile RPC", async () => {
  const result = {
    ok: true,
    profileId: id,
    slug: "writer",
    version: 2,
    changed: true,
    replayed: false,
  };
  mocks.rpc.mockResolvedValue({ data: result, error: null });
  expect(await saveOwnProfileAction(command)).toEqual(result);
  expect(mocks.rpc).toHaveBeenCalledWith("save_own_public_profile", {
    p_request_id: id,
    p_expected_version: 1,
    p_display_name: "Writer",
    p_biography: null,
  });
});
it("denies inactive access and rejects forged fields", async () => {
  mocks.access.mockResolvedValue({ status: "pending" });
  expect(await saveOwnProfileAction(command)).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(
    await saveOwnProfileAction({ ...command, profileId: id } as never),
  ).toEqual({ ok: false, code: "invalid_input" });
  expect(mocks.rpc).not.toHaveBeenCalled();
});
