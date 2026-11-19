import { beforeEach, expect, it, vi } from "vitest";
import {
  access,
  articleId,
  profileId,
  queryTestClient,
  updatedAt,
} from "./draft-query-test-client";
import { baseDraft } from "../../../shared/articles/draft-contract/draft-test-cases";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), client: vi.fn() }));
vi.mock("@/backend/auth/access/access", () => ({
  requireActiveMembership: mocks.guard,
}));
vi.mock("@/backend/infrastructure/supabase/server/server", () => ({
  createServerSupabaseClient: mocks.client,
}));
vi.mock("next/server", () => ({ connection: vi.fn() }));
import {
  getDraftDetail,
  getDraftOptions,
  getDraftEditorData,
} from "./draft-queries";
let http: ReturnType<typeof queryTestClient>;
const row = {
  id: articleId,
  title: baseDraft.title,
  slug: "synthetic-draft",
  status: "draft",
  section_id: baseDraft.sectionId,
  edit_version: 2,
  updated_at: updatedAt,
  owner_profile_id: profileId,
  excerpt: null,
  content: null,
  seo_keyphrase: null,
  meta_description: null,
  publication_date: null,
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
it("returns archived articles without exposing editable content", async () => {
  http.respond({
    ...row,
    status: "archived",
    content: { secret: "legacy body" },
  });
  expect(await getDraftDetail(articleId)).toEqual({
    kind: "readOnly",
    status: "archived",
  });
  expect(http.network).toHaveBeenCalledOnce();
});
it("shows an author their published article read-only", async () => {
  http.respond({ ...row, status: "published" });
  expect(await getDraftDetail(articleId)).toMatchObject({
    kind: "viewOnly",
    status: "published",
    articleId,
    version: 2,
    capabilities: { edit: false, archive: false },
  });
});
it("shows an author their submitted draft read-only until an editor acts", async () => {
  http.respond({ ...row, review_requested_at: updatedAt });
  expect(await getDraftDetail(articleId)).toMatchObject({
    kind: "viewOnly",
    status: "draft",
    review: { requestedAt: updatedAt },
    capabilities: { edit: false, submit: false },
  });
});
it("preserves an unsupported published body without editable controls", async () => {
  http.respond({
    ...row,
    status: "published",
    content: { secret: "legacy body" },
  });
  expect(await getDraftDetail(articleId)).toEqual({
    kind: "unsupportedContent",
    status: "published",
    articleId,
    version: 2,
    capabilities: expect.any(Object),
  });
  expect(http.network).toHaveBeenCalledOnce();
});
it("returns unsupported legacy body without exposing it", async () => {
  http.respond({ ...row, content: { secret: "legacy body" } });
  expect(await getDraftDetail(articleId)).toEqual({
    kind: "unsupportedContent",
    status: "draft",
    articleId,
    version: 2,
    capabilities: expect.any(Object),
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

it("returns editor detail and one shared catalog load", async () => {
  http.respond(row);
  http.respond([{ id: row.section_id, name: "Section" }]);
  http.respond([]);
  http.respond([]);
  http.respond([]);
  const result = await getDraftEditorData(articleId);
  expect(result.detail).toMatchObject({
    kind: "editable",
    unavailableSelections: { sectionId: null },
  });
  expect(result.options?.sections).toEqual([
    { id: row.section_id, name: "Section" },
  ]);
  expect(http.network).toHaveBeenCalledTimes(5);
  expect(mocks.guard).toHaveBeenCalledOnce();
  for (const table of ["sections", "categories", "tags", "profiles"]) {
    expect(
      http.network.mock.calls.filter(([url]) =>
        new URL(String(url)).pathname.endsWith("/" + table),
      ),
    ).toHaveLength(1);
  }
});
it("does not reuse private catalogs between users or requests", async () => {
  http.respond(row);
  for (let i = 0; i < 4; i++) http.respond([]);
  const first = await getDraftEditorData(articleId);
  const other = queryTestClient();
  other.respond({ ...row, owner_profile_id: articleId });
  other.respond([{ id: row.section_id, name: "Fresh section" }]);
  for (let i = 0; i < 3; i++) other.respond([]);
  mocks.client.mockResolvedValue(other.client);
  mocks.guard.mockResolvedValue({
    ...access,
    profileId: articleId,
    userId: articleId,
  });
  const second = await getDraftEditorData(articleId);
  expect(first.options?.sections).toEqual([]);
  expect(second.options?.sections[0].name).toBe("Fresh section");
  expect(
    new URL(String(other.network.mock.calls[0][0])).searchParams.get(
      "owner_profile_id",
    ),
  ).toBe(`eq.${articleId}`);
  expect(mocks.guard).toHaveBeenCalledTimes(2);
  expect(other.network).toHaveBeenCalledTimes(5);
});
it.each([
  null,
  { ...row, status: "archived" },
  { ...row, content: { legacy: true } },
])("omits catalogs for noneditable editor reads", async (value) => {
  http.respond(value);
  expect((await getDraftEditorData(articleId)).options).toBeNull();
  expect(http.network).toHaveBeenCalledOnce();
});
it("carries a stored publication date into the editor input", async () => {
  http.respond({ ...row, publication_date: "2026-01-15" });
  for (let i = 0; i < 4; i++) http.respond([]);
  const result = await getDraftDetail(articleId);
  expect(result).toMatchObject({
    kind: "editable",
    draft: { publicationDate: "2026-01-15" },
  });
});
