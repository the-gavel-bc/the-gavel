import { beforeEach, expect, it, vi } from "vitest";
import {
  access,
  articleId,
  profileId,
  queryTestClient,
} from "@/backend/articles/draft-queries/draft-query-test-client";
const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  client: vi.fn(),
  connection: vi.fn(),
}));
vi.mock("@/backend/auth/access/access", () => ({
  requireActiveMembership: mocks.guard,
}));
vi.mock("@/backend/infrastructure/supabase/server/server", () => ({
  createServerSupabaseClient: mocks.client,
}));
vi.mock("next/server", () => ({ connection: mocks.connection }));
import { listAdminTaxonomy } from "./admin-taxonomy";
let http: ReturnType<typeof queryTestClient>;
const row = {
  id: articleId,
  name: "News",
  slug: "news",
  parent_name: null,
  navigation_order: 0,
  active: true,
  edit_version: 1,
  referenced_live: false,
  in_use: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  http = queryTestClient();
  mocks.client.mockResolvedValue(http.client);
  mocks.guard.mockResolvedValue({ ...access, role: "administrator" });
});
it("bounds the catalog and binds the cursor to its kind", async () => {
  http.respond([row, { ...row, id: profileId }]);
  const page = await listAdminTaxonomy({ kind: "section", pageSize: 1 });
  expect(page.items[0]).toMatchObject({
    id: articleId,
    name: "News",
    version: 1,
  });
  expect(page.nextCursor).toEqual(expect.any(String));
  http.respond([]);
  await listAdminTaxonomy({ kind: "section", cursor: page.nextCursor });
  expect(JSON.parse(String(http.network.mock.calls[1][1]?.body))).toMatchObject(
    { p_after_id: articleId },
  );
  await expect(
    listAdminTaxonomy({ kind: "tag", cursor: page.nextCursor }),
  ).rejects.toThrow("Invalid taxonomy list request.");
});
it("rejects invalid input and authors before querying", async () => {
  await expect(listAdminTaxonomy({ kind: "unknown" })).rejects.toThrow(
    "Invalid taxonomy list request.",
  );
  mocks.guard.mockResolvedValue(access);
  await expect(listAdminTaxonomy({})).rejects.toThrow(
    "Administrator access required.",
  );
  expect(http.network).not.toHaveBeenCalled();
});
it("hides database errors and rejects malformed rows", async () => {
  http.respond({ message: "private SQL" }, 500);
  await expect(listAdminTaxonomy({})).rejects.toThrow(
    "Unable to load taxonomy.",
  );
  http.respond([{ ...row, active: null }]);
  await expect(listAdminTaxonomy({})).rejects.toThrow(
    "Unable to load taxonomy.",
  );
});
