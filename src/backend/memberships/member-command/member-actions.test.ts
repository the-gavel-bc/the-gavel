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
import { manageMembershipAction } from "./member-actions";

const targetUserId = "90000000-0000-0000-0000-000000000005";
const requestId = "80000000-0000-0000-0000-000000000901";
const approve = {
  kind: "approve",
  targetUserId,
  requestId,
  role: "author",
  displayName: "New Member",
  expectedVersion: 1,
} as const;
const success = {
  ok: true,
  targetUserId,
  role: "author",
  active: true,
  version: 2,
  changed: true,
  replayed: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ status: "active", role: "administrator" });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: success, error: null });
});

it("sends only allowlisted approval fields through the user-scoped RPC", async () => {
  expect(await manageMembershipAction(approve)).toEqual(success);
  expect(mocks.rpc).toHaveBeenCalledWith("approve_membership", {
    p_target_user_id: targetUserId,
    p_request_id: requestId,
    p_role: "author",
    p_display_name: "New Member",
    p_expected_version: 1,
  });
  expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard/admin/members");
});

it("blocks authors, pending users, and forged commands before the RPC", async () => {
  mocks.access.mockResolvedValue({ status: "active", role: "author" });
  expect(await manageMembershipAction(approve)).toEqual({
    ok: false,
    code: "forbidden",
  });
  mocks.access.mockResolvedValue({ status: "pending" });
  expect(await manageMembershipAction(approve)).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(
    await manageMembershipAction({
      ...approve,
      actorUserId: targetUserId,
    } as never),
  ).toEqual({
    ok: false,
    code: "invalid_input",
  });
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("keeps a safe uncertain result for transport or malformed database responses", async () => {
  mocks.rpc.mockResolvedValueOnce({
    data: null,
    error: { message: "SQL secret" },
  });
  expect(await manageMembershipAction(approve)).toEqual({
    ok: false,
    code: "unavailable",
  });
  mocks.rpc.mockResolvedValueOnce({
    data: { ...success, active: false },
    error: null,
  });
  expect(await manageMembershipAction(approve)).toEqual({
    ok: false,
    code: "unavailable",
  });
  expect(mocks.revalidate).not.toHaveBeenCalled();
});

it("returns the explicit last-administrator outcome without invalidating the directory", async () => {
  mocks.rpc.mockResolvedValueOnce({
    data: { ok: false, code: "last_administrator" },
    error: null,
  });
  expect(
    await manageMembershipAction({
      kind: "deactivate",
      targetUserId,
      expectedVersion: 1,
      requestId,
    }),
  ).toEqual({ ok: false, code: "last_administrator" });
  expect(mocks.revalidate).not.toHaveBeenCalled();
});

it("routes role changes and deactivation to their narrow operations", async () => {
  await manageMembershipAction({
    kind: "changeRole",
    targetUserId,
    expectedVersion: 1,
    requestId,
    role: "author",
  });
  expect(mocks.rpc).toHaveBeenCalledWith("change_membership_role", {
    p_target_user_id: targetUserId,
    p_expected_version: 1,
    p_request_id: requestId,
    p_role: "author",
  });
  mocks.rpc.mockResolvedValueOnce({
    data: { ...success, active: false },
    error: null,
  });
  await manageMembershipAction({
    kind: "deactivate",
    targetUserId,
    expectedVersion: 1,
    requestId,
  });
  expect(mocks.rpc).toHaveBeenCalledWith("deactivate_membership", {
    p_target_user_id: targetUserId,
    p_expected_version: 1,
    p_request_id: requestId,
  });
});
