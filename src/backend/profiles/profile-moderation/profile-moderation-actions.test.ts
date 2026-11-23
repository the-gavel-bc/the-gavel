import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  client: vi.fn(),
  rpc: vi.fn(),
  invalidate: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/backend/auth/access/access", () => ({
  getCurrentAccess: mocks.access,
}));
vi.mock("@/backend/infrastructure/supabase/server/server", () => ({
  createServerSupabaseClient: mocks.client,
}));
vi.mock("@/backend/public-site/public-shell-cache/public-shell-cache", () => ({
  invalidatePublicShell: mocks.invalidate,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import {
  moderateProfileAction,
  readProfileModerationAction,
} from "./profile-moderation-actions";

const userId = "00000000-0000-0000-0000-000000000002";
const command = {
  userId,
  expectedVersion: 5,
  requestId: "00000000-0000-0000-0000-000000000004",
  hidden: true,
  clearBiography: true,
  resetDisplayName: false,
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
});
it.each(["author", "editor"])(
  "denies %s before reading or writing a profile",
  async (role) => {
    mocks.access.mockResolvedValue({ status: "active", role });
    await expect(readProfileModerationAction(userId)).resolves.toBeNull();
    await expect(moderateProfileAction(command)).resolves.toEqual({
      ok: false,
      code: "forbidden",
    });
    expect(mocks.client).not.toHaveBeenCalled();
  },
);
it("uses the same target, version and request ID for moderation", async () => {
  mocks.access.mockResolvedValue({ status: "active", role: "administrator" });
  const receipt = {
    ok: true,
    hidden: true,
    version: 6,
    replayed: false,
    changed: true,
  };
  mocks.rpc.mockResolvedValue({ data: receipt, error: null });
  await expect(moderateProfileAction(command)).resolves.toEqual(receipt);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("moderate_member_profile", {
    p_user_id: userId,
    p_expected_version: 5,
    p_request_id: command.requestId,
    p_hide_page: true,
    p_clear_biography: true,
    p_reset_display_name: false,
  });
  expect(mocks.invalidate).toHaveBeenCalledOnce();
});
