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
import { curateTaxonomyAction } from "./taxonomy-curation-action";

const id = "81000000-0000-0000-0000-000000000001";
const requestId = "81000000-0000-0000-0000-000000000002";
const targetId = "81000000-0000-0000-0000-000000000003";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ status: "active", role: "administrator" });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({
    data: { ok: true, replayed: false },
    error: null,
  });
});

it.each([
  [
    { kind: "createSection", requestId, name: "News", navigationOrder: 3 },
    "create_taxonomy",
    {
      p_kind: "section",
      p_request_id: requestId,
      p_name: "News",
      p_navigation_order: 3,
    },
  ],
  [
    {
      kind: "createCategory",
      requestId,
      name: "Sports",
      navigationOrder: 1,
      sectionId: id,
    },
    "create_taxonomy",
    {
      p_kind: "category",
      p_request_id: requestId,
      p_name: "Sports",
      p_navigation_order: 1,
      p_parent_id: id,
    },
  ],
  [
    { kind: "renameTag", requestId, id, name: "New name" },
    "rename_tag",
    { p_id: id, p_request_id: requestId, p_name: "New name" },
  ],
  [
    { kind: "mergeTags", requestId, id, targetId },
    "merge_tags",
    { p_source_id: id, p_target_id: targetId, p_request_id: requestId },
  ],
  [
    { kind: "deleteTag", requestId, id },
    "delete_unused_tag",
    { p_id: id, p_request_id: requestId },
  ],
] as const)("sends %j to %s", async (command, name, args) => {
  expect(await curateTaxonomyAction(command)).toEqual({ ok: true });
  expect(mocks.rpc).toHaveBeenCalledWith(name, args);
  expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard/admin/taxonomy");
});

it("rejects malformed input and non-administrators before any RPC", async () => {
  expect(
    await curateTaxonomyAction({
      kind: "renameTag",
      requestId,
      id,
      name: "two  spaces",
    }),
  ).toEqual({ ok: false, code: "invalid_input" });
  expect(
    await curateTaxonomyAction({
      kind: "mergeTags",
      requestId,
      id,
    } as never),
  ).toEqual({ ok: false, code: "invalid_input" });
  mocks.access.mockResolvedValueOnce({ status: "active", role: "author" });
  expect(
    await curateTaxonomyAction({ kind: "deleteTag", requestId, id }),
  ).toEqual({ ok: false, code: "forbidden" });
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("passes through structured failures and hides transport errors", async () => {
  mocks.rpc.mockResolvedValueOnce({
    data: { ok: false, code: "conflict" },
    error: null,
  });
  expect(
    await curateTaxonomyAction({ kind: "deleteTag", requestId, id }),
  ).toEqual({ ok: false, code: "conflict" });
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "secret" } });
  expect(
    await curateTaxonomyAction({ kind: "deleteTag", requestId, id }),
  ).toEqual({ ok: false, code: "unavailable" });
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
