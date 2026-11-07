import { beforeEach, expect, it, vi } from "vitest";
import {
  access,
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
import { getAdminHomepageCuration } from "./homepage-curation";
let http: ReturnType<typeof queryTestClient>;
beforeEach(() => {
  vi.clearAllMocks();
  http = queryTestClient();
  mocks.client.mockResolvedValue(http.client);
  mocks.guard.mockResolvedValue({ ...access, role: "administrator" });
});
it("reads bounded safe saved and fallback projections", async () => {
  const view = {
    version: 1,
    saved: { lead: null, featured: [], readThis: [] },
    effective: { lead: null, featured: [], readThis: [] },
  };
  http.respond(view);
  expect(await getAdminHomepageCuration()).toEqual(view);
  expect(new URL(String(http.network.mock.calls[0][0])).pathname).toContain(
    "/rpc/get_admin_homepage_curation",
  );
});
it("denies authors and hides malformed or failed reads", async () => {
  mocks.guard.mockResolvedValueOnce(access);
  await expect(getAdminHomepageCuration()).rejects.toThrow(
    "Administrator access required.",
  );
  expect(http.network).not.toHaveBeenCalled();
  http.respond({ message: "private" }, 500);
  await expect(getAdminHomepageCuration()).rejects.toThrow(
    "Unable to load homepage curation.",
  );
  http.respond({ version: 0 });
  await expect(getAdminHomepageCuration()).rejects.toThrow(
    "Unable to load homepage curation.",
  );
});
