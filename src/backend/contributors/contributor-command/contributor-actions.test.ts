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
import { manageContributorAction } from "./contributor-actions";

const profileId = "90000000-0000-0000-0000-000000000901";
const requestId = "80000000-0000-0000-0000-000000000901";
const command = {
  kind: "save",
  profileId,
  expectedVersion: 1,
  requestId,
  displayName: "Guest Writer",
  biography: null,
} as const;
const success = {
  ok: true,
  profileId,
  slug: "guest-writer",
  version: 2,
  active: true,
  changed: true,
  replayed: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ status: "active", role: "administrator" });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: success, error: null });
});
it("uses only allowlisted fields through user-scoped RPC", async () => {
  expect(await manageContributorAction(command)).toEqual(success);
  expect(mocks.rpc).toHaveBeenCalledWith("save_contributor_profile", {
    p_profile_id: profileId,
    p_expected_version: 1,
    p_request_id: requestId,
    p_display_name: "Guest Writer",
    p_biography: null,
  });
  expect(mocks.revalidate).toHaveBeenCalledWith(
    "/dashboard/admin/contributors",
  );
});
it("denies authors and forged commands before any RPC", async () => {
  mocks.access.mockResolvedValue({ status: "active", role: "author" });
  expect(await manageContributorAction(command)).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(
    await manageContributorAction({ ...command, slug: "chosen" } as never),
  ).toEqual({ ok: false, code: "invalid_input" });
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("masks uncertain transport results", async () => {
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { message: "private SQL" },
  });
  expect(await manageContributorAction(command)).toEqual({
    ok: false,
    code: "unavailable",
  });
});
