import { beforeEach, expect, it, vi } from "vitest";
import {
  access,
  articleId,
  profileId,
  queryTestClient,
  updatedAt,
} from "./draft-query-test-client";
import { baseDraft } from "../draft-contract/draft-test-cases";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/auth/access/access", () => ({
  requireActiveMembership: mocks.guard,
}));
vi.mock("@/lib/supabase/server/server", () => ({
  createServerSupabaseClient: mocks.client,
}));
vi.mock("next/server", () => ({ connection: vi.fn() }));
import { getDraftDetail, getDraftOptions } from "./draft-queries";
let http: ReturnType<typeof queryTestClient>;
const row = {
  id: articleId,
  title: baseDraft.title,
  slug: "synthetic-draft",
  status: "draft",
  section_id: baseDraft.sectionId,
  edit_version: 2,
  updated_at: updatedAt,
  excerpt: null,
  content: null,
  seo_keyphrase: null,
  meta_description: null,
  article_categories: [],
  article_tags: [],
  article_contributors: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  http = queryTestClient();
  mocks.client.mockResolvedValue(http.client);
  mocks.guard.mockResolvedValue(access);
});
it("reads body and associations in one snapshot and retains unavailable IDs", async () => {
  http.respond({
    ...row,
    article_categories: [{ category_id: profileId }],
    article_contributors: [
      { profile_id: profileId, contribution_role: "writer", display_order: 0 },
    ],
  });
  for (let i = 0; i < 4; i++) http.respond([]);
  const result = await getDraftDetail(articleId);
  expect(result).toMatchObject({
    kind: "editable",
    articleId,
    version: 2,
    updatedAt,
    draft: {
      ...baseDraft,
      content: null,
      excerpt: null,
      seoKeyphrase: null,
      metaDescription: null,
      categoryIds: [profileId],
      tagIds: [],
      contributors: [{ profileId, role: "writer", displayOrder: 0 }],
    },
    unavailableSelections: {
      sectionId: baseDraft.sectionId,
      categoryIds: [profileId],
      tagIds: [],
      contributorIds: [profileId],
    },
  });
  const url = new URL(String(http.network.mock.calls[0][0]));
  expect(url.searchParams.get("owner_profile_id")).toBe(`eq.${profileId}`);
  expect(url.searchParams.get("id")).toBe(`eq.${articleId}`);
  for (const relation of [
    "article_categories(category_id)",
    "article_tags(tag_id)",
    "article_contributors(profile_id,contribution_role,display_order)",
  ])
    expect(url.searchParams.get("select")).toContain(relation);
});
it("allows administrator detail reads through RLS without an owner filter", async () => {
  mocks.guard.mockResolvedValue({ ...access, role: "administrator" });
  http.respond(null);
  expect(await getDraftDetail(articleId)).toEqual({ kind: "notFound" });
  expect(
    new URL(String(http.network.mock.calls[0][0])).searchParams.has(
      "owner_profile_id",
    ),
  ).toBe(false);
});
it.each(["published", "archived"])(
  "returns %s without exposing editable content",
  async (status) => {
    http.respond({ ...row, status, content: { secret: "legacy body" } });
    expect(await getDraftDetail(articleId)).toEqual({
      kind: "readOnly",
      status,
    });
    expect(http.network).toHaveBeenCalledOnce();
  },
);
it("returns unsupported legacy body without exposing it", async () => {
  http.respond({ ...row, content: { secret: "legacy body" } });
  expect(await getDraftDetail(articleId)).toEqual({
    kind: "unsupportedContent",
  });
  expect(http.network).toHaveBeenCalledOnce();
});
it("reports RLS-hidden records as missing and masks database failures", async () => {
  http.respond(null);
  expect(await getDraftDetail(articleId)).toEqual({ kind: "notFound" });
  http.respond({ message: "private SQL" }, 500);
  await expect(getDraftDetail(articleId)).rejects.toThrow(
    /^Unable to load draft\.$/,
  );
});
it("validates detail IDs and preserves access redirects", async () => {
  await expect(getDraftDetail("invalid")).rejects.toThrow(
    "Invalid article ID.",
  );
  mocks.guard.mockRejectedValue(new Error("redirect:/sign-in"));
  await expect(getDraftDetail(articleId)).rejects.toThrow("redirect:/sign-in");
  expect(http.network).not.toHaveBeenCalled();
});
it("guards the public options query and validates its optional section", async () => {
  await expect(getDraftOptions("invalid")).rejects.toThrow(
    "Invalid section ID.",
  );
  mocks.guard.mockRejectedValue(new Error("redirect:/access-pending"));
  await expect(getDraftOptions()).rejects.toThrow("redirect:/access-pending");
  mocks.guard.mockResolvedValue({ ...access, role: "administrator" });
  for (let i = 0; i < 4; i++) http.respond([]);
  expect(await getDraftOptions(profileId)).toEqual({
    sections: [],
    categories: [],
    tags: [],
    contributors: [],
  });
  expect(mocks.guard).toHaveBeenCalledTimes(2);
});
it("does not mark a selected tag after catalog row 1000 unavailable", async () => {
  http.respond({ ...row, article_tags: [{ tag_id: articleId }] });
  http.network.mockImplementation(async (input) => {
    const url = new URL(String(input));
    const rows = url.pathname.endsWith("/tags")
      ? url.searchParams.get("offset") === "1500"
        ? [{ id: articleId, name: "Selected tag" }]
        : Array.from({ length: 500 }, () => ({
            id: profileId,
            name: "Other tag",
          }))
      : [];
    return new Response(JSON.stringify(rows), {
      headers: { "Content-Type": "application/json" },
    });
  });
  const result = await getDraftDetail(articleId);
  expect(result.kind).toBe("editable");
  if (result.kind === "editable") {
    expect(result.draft.tagIds).toEqual([articleId]);
    expect(result.unavailableSelections.tagIds).toEqual([]);
  }
});
