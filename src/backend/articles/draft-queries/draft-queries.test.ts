import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  access,
  articleId,
  profileId,
  queryTestClient,
  updatedAt,
} from "./draft-query-test-client";
import {
  decodeDraftCursor,
  encodeDraftCursor,
} from "../../../shared/articles/draft-cursor/draft-cursor";
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
import { getMyArticlesPage } from "./draft-queries";
let http: ReturnType<typeof queryTestClient>;
const row = {
  id: articleId,
  title: "Draft",
  slug: "draft",
  status: "draft",
  section_id: profileId,
  edit_version: 2,
  updated_at: updatedAt,
  section: { name: "News" },
};
beforeEach(() => {
  vi.clearAllMocks();
  http = queryTestClient();
  mocks.client.mockResolvedValue(http.client);
  mocks.guard.mockResolvedValue(access);
});
describe("own article page", () => {
  it.each(["author", "administrator"])(
    "filters %s by caller ownership and only selects summaries",
    async (role) => {
      mocks.guard.mockResolvedValue({ ...access, role });
      http.respond([row, { ...row, id: profileId }]);
      const result = await getMyArticlesPage({ pageSize: 1 });
      expect(result.items).toEqual([
        {
          id: articleId,
          title: "Draft",
          slug: "draft",
          status: "draft",
          sectionId: profileId,
          sectionName: "News",
          version: 2,
          updatedAt,
          inReview: false,
          reviewNote: null,
        },
      ]);
      expect(decodeDraftCursor(result.nextCursor)).toEqual({
        version: 1,
        id: articleId,
        updatedAt,
      });
      const url = new URL(String(http.network.mock.calls[0][0]));
      expect(url.searchParams.get("owner_profile_id")).toBe(`eq.${profileId}`);
      expect(url.searchParams.get("select")).toBe(
        "id,title,slug,status,section_id,edit_version,updated_at,review_requested_at,review_note,section:sections!articles_section_id_fkey(name)",
      );
      // No filters unless asked for.
      expect(url.searchParams.get("status")).toBeNull();
      expect(url.searchParams.get("title")).toBeNull();
      expect(url.searchParams.get("order")).toBe("updated_at.desc,id.desc");
      expect(url.searchParams.get("limit")).toBe("2");
      expect(mocks.connection).toHaveBeenCalledOnce();
    },
  );
  it("filters by status and a safe title search, still owner-scoped", async () => {
    http.respond([]);
    await getMyArticlesPage({ status: "published", search: " O'Neill-1 " });
    const url = new URL(String(http.network.mock.calls[0][0]));
    expect(url.searchParams.get("owner_profile_id")).toBe(`eq.${profileId}`);
    expect(url.searchParams.get("status")).toBe("eq.published");
    expect(url.searchParams.get("title")).toBe("ilike.%O'Neill-1%");
  });
  it.each([{ status: "deleted" }, { search: "100%" }, { search: "a,b)" }])(
    "rejects an unknown status or unsafe search before a read: %o",
    async (input) => {
      await expect(getMyArticlesPage(input)).rejects.toThrow(
        "Invalid article page request.",
      );
      expect(http.network).not.toHaveBeenCalled();
    },
  );
  it("uses default bounds and a precision-preserving keyset", async () => {
    http.respond([]);
    expect(
      await getMyArticlesPage({
        cursor: encodeDraftCursor({ id: articleId, updatedAt }),
      }),
    ).toEqual({ items: [], nextCursor: null });
    const url = new URL(String(http.network.mock.calls[0][0]));
    expect(url.searchParams.get("limit")).toBe("21");
    expect(url.searchParams.get("or")).toBe(
      `(updated_at.lt.${updatedAt},and(updated_at.eq.${updatedAt},id.lt.${articleId}))`,
    );
  });
  it.each([
    { pageSize: 0 },
    { pageSize: 51 },
    { pageSize: 1.5 },
    { cursor: "invalid" },
    { owner: profileId },
    null,
  ])("rejects bad input before a read", async (input) => {
    await expect(getMyArticlesPage(input as never)).rejects.toThrow(
      "Invalid article page request.",
    );
    expect(http.network).not.toHaveBeenCalled();
  });
  it("preserves the membership redirect", async () => {
    mocks.guard.mockRejectedValue(new Error("redirect:/access-pending"));
    await expect(getMyArticlesPage({})).rejects.toThrow(
      "redirect:/access-pending",
    );
    expect(http.network).not.toHaveBeenCalled();
  });
  it("hides database errors and malformed data", async () => {
    http.respond({ message: "private SQL" }, 500);
    await expect(getMyArticlesPage({})).rejects.toThrow(
      /^Unable to load articles\.$/,
    );
    http.respond([{ ...row, edit_version: -1 }]);
    await expect(getMyArticlesPage({})).rejects.toThrow(
      /^Unable to load articles\.$/,
    );
  });
});
