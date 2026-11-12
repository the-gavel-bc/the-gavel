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
import {
  searchContributorsAction,
  createGuestContributorAction,
} from "./guest-contributor-actions";
const id = "d8000000-0000-0000-0000-000000000001";
const profile = { id, displayName: "Guest", slug: "guest" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ status: "active" });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
});
it("bounds input and guards both actions", async () => {
  expect(await searchContributorsAction("")).toEqual({
    ok: false,
    code: "invalid_input",
  });
  expect(
    await createGuestContributorAction({
      requestId: "bad",
      displayName: "Guest",
    }),
  ).toEqual({ ok: false, code: "invalid_input" });
  mocks.access.mockResolvedValue({ status: "inactive" });
  expect(await searchContributorsAction("Guest")).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(
    await createGuestContributorAction({ requestId: id, displayName: "Guest" }),
  ).toEqual({ ok: false, code: "forbidden" });
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("returns narrow public choices and rejects private extra fields", async () => {
  mocks.rpc.mockResolvedValueOnce({
    data: { ok: true, items: [profile] },
    error: null,
  });
  expect(await searchContributorsAction(" Guest ")).toEqual({
    ok: true,
    items: [profile],
  });
  expect(mocks.rpc).toHaveBeenCalledWith("search_contributors", {
    p_query: "Guest",
  });
  mocks.rpc.mockResolvedValueOnce({
    data: { ok: true, items: [{ ...profile, auth_user_id: id }] },
    error: null,
  });
  expect(await searchContributorsAction("Guest")).toEqual({
    ok: false,
    code: "unavailable",
  });
});
it("sends request identity and preserves replay/conflict results", async () => {
  mocks.rpc.mockResolvedValueOnce({
    data: { ...profile, ok: true, created: true, replayed: false },
    error: null,
  });
  expect(
    await createGuestContributorAction({ requestId: id, displayName: "Guest" }),
  ).toMatchObject({ ok: true, id });
  expect(mocks.rpc).toHaveBeenCalledWith("create_guest_contributor", {
    p_request_id: id,
    p_display_name: "Guest",
  });
  mocks.rpc.mockResolvedValueOnce({
    data: { ok: false, code: "request_conflict" },
    error: null,
  });
  expect(
    await createGuestContributorAction({
      requestId: id,
      displayName: "Changed",
    }),
  ).toEqual({ ok: false, code: "request_conflict" });
  mocks.rpc.mockRejectedValueOnce(Error("private SQL"));
  expect(await searchContributorsAction("Guest")).toEqual({
    ok: false,
    code: "unavailable",
  });
});
