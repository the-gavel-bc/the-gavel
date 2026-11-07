import { beforeEach, expect, it, vi } from "vitest";
import {
  access,
  articleId,
  profileId,
  queryTestClient,
} from "@/lib/articles/draft-queries/draft-query-test-client";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  client: vi.fn(),
  connection: vi.fn(),
}));
vi.mock("@/lib/auth/access/access", () => ({
  requireActiveMembership: mocks.guard,
}));
vi.mock("@/lib/supabase/server/server", () => ({
  createServerSupabaseClient: mocks.client,
}));
vi.mock("next/server", () => ({ connection: mocks.connection }));
import { listAdminContributors } from "./admin-contributors";

let http: ReturnType<typeof queryTestClient>;
const row = {
  profile_id: articleId,
  display_name: "Guest Writer",
  slug: "guest-writer",
  biography: "Plain text",
  active: true,
  edit_version: 1,
  slug_frozen: false,
  linked_account: false,
  referenced_live: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  http = queryTestClient();
  mocks.client.mockResolvedValue(http.client);
  mocks.guard.mockResolvedValue({ ...access, role: "administrator" });
});
it("returns bounded safe contributor summaries and a state-bound cursor", async () => {
  http.respond([row, { ...row, profile_id: profileId }]);
  const page = await listAdminContributors({ state: "active", pageSize: 1 });
  expect(page.items[0]).toMatchObject({
    id: articleId,
    slug: "guest-writer",
    linkedAccount: false,
  });
  expect(page.nextCursor).toEqual(expect.any(String));
  expect(new URL(String(http.network.mock.calls[0][0])).pathname).toContain(
    "/rpc/list_admin_contributors",
  );
  http.respond([]);
  await listAdminContributors({ state: "active", cursor: page.nextCursor });
  expect(JSON.parse(String(http.network.mock.calls[1][1]?.body))).toMatchObject(
    {
      p_before_slug: "guest-writer",
      p_before_id: articleId,
    },
  );
  await expect(
    listAdminContributors({ state: "inactive", cursor: page.nextCursor }),
  ).rejects.toThrow("Invalid contributor list request.");
});
it("rejects malformed input and authors before querying", async () => {
  for (const input of [
    { state: "deleted" },
    { pageSize: 51 },
    { cursor: "bad" },
    { auth_user_id: articleId },
  ])
    await expect(listAdminContributors(input)).rejects.toThrow(
      "Invalid contributor list request.",
    );
  mocks.guard.mockResolvedValue(access);
  await expect(listAdminContributors({})).rejects.toThrow(
    "Administrator access required.",
  );
  expect(http.network).not.toHaveBeenCalled();
});
it("masks malformed rows and database diagnostics", async () => {
  http.respond({ message: "private Auth link" }, 500);
  await expect(listAdminContributors({})).rejects.toThrow(
    "Unable to load contributors.",
  );
  http.respond([{ ...row, slug: "INVALID" }]);
  await expect(listAdminContributors({})).rejects.toThrow(
    "Unable to load contributors.",
  );
});
