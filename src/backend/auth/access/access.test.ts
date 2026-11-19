import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentAccess, requireActiveMembership } from "./access";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  membership: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/backend/infrastructure/supabase/server/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: (table: string) => {
      if (table !== "memberships") throw new Error("Unexpected table");
      return {
        select: (fields: string) => {
          if (fields !== "role, active") throw new Error("Unexpected fields");
          return {
            eq: (column: string, userId: string) => {
              if (column !== "user_id" || userId !== "user-a")
                throw new Error("Unscoped membership read");
              return { maybeSingle: mocks.membership };
            },
          };
        },
      };
    },
    rpc: mocks.rpc,
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({
    data: {
      user: {
        id: "user-a",
        email: "synthetic@bc.edu",
        email_confirmed_at: "2026-01-01",
        app_metadata: { provider: "google", providers: ["google"] },
      },
    },
    error: null,
  });
  mocks.membership.mockResolvedValue({
    data: { role: "author", active: true },
    error: null,
  });
  mocks.rpc.mockImplementation(async (name: string) =>
    name === "claim_invitation"
      ? { data: false, error: null }
      : { data: [{ id: "profile-a", display_name: "Author A" }], error: null },
  );
});

describe("membership access", () => {
  it("claims a listed address at first sign-in", async () => {
    mocks.membership
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: { role: "administrator", active: true },
        error: null,
      });
    mocks.rpc.mockImplementation(async (name: string) =>
      name === "claim_invitation"
        ? { data: true, error: null }
        : {
            data: [{ id: "profile-a", display_name: "Author A" }],
            error: null,
          },
    );
    expect(await getCurrentAccess()).toMatchObject({
      status: "active",
      role: "administrator",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("claim_invitation");
  });
  it("treats a failed claim as not approved", async () => {
    mocks.membership.mockResolvedValue({ data: null, error: null });
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "x" } });
    expect(await getCurrentAccess()).toEqual({ status: "pending" });
  });
  it("never claims for an ineligible identity", async () => {
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "user-a",
          email: "synthetic@example.test",
          email_confirmed_at: "2026-01-01",
          app_metadata: { provider: "google" },
        },
      },
      error: null,
    });
    expect(await getCurrentAccess()).toEqual({ status: "pending" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("denies a missing or invalid session", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(await getCurrentAccess()).toEqual({ status: "signedOut" });
    await expect(requireActiveMembership()).rejects.toThrow(
      "redirect:/sign-in",
    );
  });
  it.each([null, { role: "author", active: false }])(
    "denies missing or inactive membership: %j",
    async (data) => {
      mocks.membership.mockResolvedValue({ data, error: null });
      expect(await getCurrentAccess()).toEqual({ status: "pending" });
      await expect(requireActiveMembership()).rejects.toThrow(
        "redirect:/access-pending",
      );
    },
  );
  it.each(["author", "administrator"])(
    "returns scoped active %s access",
    async (role) => {
      mocks.membership.mockResolvedValue({
        data: { role, active: true },
        error: null,
      });
      expect(await requireActiveMembership()).toEqual({
        status: "active",
        userId: "user-a",
        profileId: "profile-a",
        displayName: "Author A",
        role,
      });
      expect(mocks.rpc).toHaveBeenCalledWith("current_profile");
    },
  );
  it.each(["synthetic@bc.edu.attacker.test", "synthetic@example.test"])(
    "denies a non-bc.edu identity: %s",
    async (email) => {
      mocks.getUser.mockResolvedValue({
        data: {
          user: {
            id: "user-a",
            email,
            email_confirmed_at: "2026-01-01",
            app_metadata: { provider: "google" },
          },
        },
        error: null,
      });
      expect(await getCurrentAccess()).toEqual({ status: "pending" });
    },
  );
  it("denies an identity without a trusted Google provider", async () => {
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "user-a",
          email: "synthetic@bc.edu",
          email_confirmed_at: "2026-01-01",
          app_metadata: { provider: "email" },
          user_metadata: { provider: "google" },
        },
      },
      error: null,
    });
    expect(await getCurrentAccess()).toEqual({ status: "pending" });
  });
  it.each([
    [{ provider: "email", providers: ["email", "google"] }],
    [{ provider: "google", providers: ["google", "email"] }],
    [{ provider: "google", providers: "google" }],
  ])(
    "denies an account with a linked non-Google identity: %j",
    async (app_metadata) => {
      mocks.getUser.mockResolvedValue({
        data: {
          user: {
            id: "user-a",
            email: "synthetic@bc.edu",
            email_confirmed_at: "2026-01-01",
            app_metadata,
          },
        },
        error: null,
      });
      expect(await getCurrentAccess()).toEqual({ status: "pending" });
      expect(mocks.membership).not.toHaveBeenCalled();
    },
  );
  it("fails closed when the linked profile is missing", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    expect(await getCurrentAccess()).toEqual({ status: "pending" });
  });
  it.each(["membership", "profile"])(
    "returns a safe error on %s lookup failure",
    async (source) => {
      const error = { message: "private query with token secret-value" };
      if (source === "membership")
        mocks.membership.mockResolvedValue({ data: null, error });
      else mocks.rpc.mockResolvedValue({ data: null, error });
      await expect(getCurrentAccess()).rejects.toThrow(
        "Unable to verify membership access.",
      );
      await expect(getCurrentAccess()).rejects.not.toThrow("secret-value");
    },
  );
});
