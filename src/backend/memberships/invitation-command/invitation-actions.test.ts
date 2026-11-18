import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  rpc: vi.fn(),
  client: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/backend/auth/access/access", () => ({ getCurrentAccess: m.access }));
vi.mock("@/backend/infrastructure/supabase/server/server", () => ({
  createServerSupabaseClient: m.client,
}));
import { manageInvitationAction } from "./invitation-actions";

const command = {
  kind: "invite" as const,
  requestId: "00000000-0000-4000-8000-000000000001",
  entries: [{ email: "someone@bc.edu", role: "author" as const }],
};
beforeEach(() => {
  vi.resetAllMocks();
  m.client.mockResolvedValue({ rpc: m.rpc });
  m.rpc.mockResolvedValue({ data: null, error: null });
});

describe("manageInvitationAction", () => {
  it.each([
    ["author", { status: "active", role: "author" }],
    ["editor", { status: "active", role: "editor" }],
    ["pending", { status: "pending" }],
    ["signed out", { status: "signedOut" }],
  ])(
    "refuses %s before creating a client or calling the database",
    async (_l, access) => {
      m.access.mockResolvedValue(access);
      expect(await manageInvitationAction(command)).toEqual({
        ok: false,
        code: "forbidden",
      });
      expect(m.client).not.toHaveBeenCalled();
      expect(m.rpc).not.toHaveBeenCalled();
    },
  );
  it("lets an administrator reach the database function", async () => {
    m.access.mockResolvedValue({ status: "active", role: "administrator" });
    await manageInvitationAction(command);
    expect(m.rpc).toHaveBeenCalledWith("invite_staff", expect.anything());
  });
});
