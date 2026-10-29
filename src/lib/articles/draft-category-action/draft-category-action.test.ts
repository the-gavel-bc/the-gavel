import { beforeEach, expect, it, vi } from "vitest";
import {
  profileId,
  queryTestClient,
} from "../draft-queries/draft-query-test-client";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/auth/access/access", () => ({
  getCurrentAccess: mocks.guard,
}));
vi.mock("@/lib/supabase/server/server", () => ({
  createServerSupabaseClient: mocks.client,
}));
import { getDraftCategoriesAction } from "./draft-category-action";
let http: ReturnType<typeof queryTestClient>;
beforeEach(() => {
  vi.resetAllMocks();
  http = queryTestClient();
  mocks.client.mockResolvedValue(http.client);
  mocks.guard.mockResolvedValue({ status: "active" });
});
it("rejects malformed input without reading catalogs", async () => {
  expect(await getDraftCategoriesAction("bad")).toEqual({
    ok: false,
    code: "invalid_input",
  });
  expect(http.network).not.toHaveBeenCalled();
});
it.each(["signedOut", "pending"])(
  "returns safe %s denial without reading catalogs or redirecting the editor",
  async (status) => {
    mocks.guard.mockResolvedValue({ status });
    expect(await getDraftCategoriesAction(profileId)).toEqual({
      ok: false,
      code: "forbidden",
    });
    expect(http.network).not.toHaveBeenCalled();
  },
);
it("returns safe access failures without reading catalogs or redirecting", async () => {
  mocks.guard.mockRejectedValue(new Error("private access detail"));
  expect(await getDraftCategoriesAction(profileId)).toEqual({
    ok: false,
    code: "unavailable",
  });
  expect(http.network).not.toHaveBeenCalled();
});
it("returns only active matching categories with an active parent", async () => {
  http.respond([{ id: profileId, name: "Campus", section_id: profileId }]);
  expect(await getDraftCategoriesAction(profileId)).toEqual({
    ok: true,
    categories: [{ id: profileId, name: "Campus", sectionId: profileId }],
  });
  const url = new URL(String(http.network.mock.calls[0][0]));
  expect(url.searchParams.get("active")).toBe("eq.true");
  expect(url.searchParams.get("sections.active")).toBe("eq.true");
  expect(url.searchParams.get("section_id")).toBe(`eq.${profileId}`);
});
it("reads beyond a catalog page and hides query errors", async () => {
  http.respond(
    Array.from({ length: 500 }, () => ({
      id: profileId,
      name: "First",
      section_id: profileId,
    })),
  );
  http.respond([{ id: profileId, name: "Last", section_id: profileId }]);
  const result = await getDraftCategoriesAction(profileId);
  expect(result.ok && result.categories.length).toBe(501);
  http.respond({ message: "private SQL" }, 500);
  expect(await getDraftCategoriesAction(profileId)).toEqual({
    ok: false,
    code: "unavailable",
  });
});
