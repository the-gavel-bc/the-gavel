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
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidate,
  updateTag: vi.fn(),
  unstable_cache: vi.fn(),
}));
import { updateTaxonomyAction } from "./taxonomy-actions";
const command = {
  kind: "section",
  id: "81000000-0000-0000-0000-000000000001",
  requestId: "81000000-0000-0000-0000-000000000002",
  expectedVersion: 1,
  name: "News",
  navigationOrder: 0,
  active: true,
} as const;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ status: "active", role: "administrator" });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
});
it("sends checked fields to the section operation", async () => {
  const result = {
    ok: true,
    kind: "section",
    id: command.id,
    version: 2,
    active: true,
    changed: true,
    replayed: false,
  };
  mocks.rpc.mockResolvedValue({ data: result, error: null });
  expect(await updateTaxonomyAction(command)).toEqual(result);
  expect(mocks.rpc).toHaveBeenCalledWith("update_section_taxonomy", {
    p_id: command.id,
    p_request_id: command.requestId,
    p_expected_version: 1,
    p_name: "News",
    p_navigation_order: 0,
    p_active: true,
  });
});
it("blocks authors and hides transport failures", async () => {
  mocks.access.mockResolvedValueOnce({ status: "active", role: "author" });
  expect(await updateTaxonomyAction(command)).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(mocks.rpc).not.toHaveBeenCalled();
  mocks.rpc.mockResolvedValue({ data: null, error: { message: "private" } });
  expect(await updateTaxonomyAction(command)).toEqual({
    ok: false,
    code: "unavailable",
  });
});
