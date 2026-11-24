import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
  limit: vi.fn(),
  publicFrom: vi.fn(),
  publicSelect: vi.fn(),
  publicIn: vi.fn(),
}));
vi.mock("@/backend/auth/access/access", () => ({
  getCurrentAccess: mocks.access,
}));
vi.mock("@/backend/infrastructure/supabase/server/server", () => ({
  createServerSupabaseClient: async () => ({ from: mocks.from }),
}));
vi.mock(
  "@/backend/infrastructure/supabase/public-reader/public-reader",
  () => ({
    createPublicReaderClient: () => ({ from: mocks.publicFrom }),
  }),
);
import { getEditorialArticlePreview } from "./article-preview";

const id = "50000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const editorId = "10000000-0000-4000-8000-000000000002";
const assetId = "70000000-0000-4000-8000-000000000001";
const row = {
  id,
  title: "Private story",
  excerpt: null,
  owner_profile_id: ownerId,
  review_requested_at: null,
  publication_date: "2026-03-08",
  correction: null,
  correction_updated_at: null,
  content: null,
  section: { id, name: "News", slug: "news" },
  owner: { display_name: "Writer", slug: "writer", active: true },
  article_contributors: [],
  article_categories: [],
  article_tags: [],
  article_main_images: null,
  article_body_images: [],
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({
    status: "active",
    role: "editor",
    profileId: editorId,
  });
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  const query = { eq: mocks.eq, limit: mocks.limit, maybeSingle: mocks.single };
  mocks.eq.mockReturnValue(query);
  mocks.limit.mockReturnValue(query);
  mocks.single.mockResolvedValue({ data: row, error: null });
  mocks.publicFrom.mockReturnValue({ select: mocks.publicSelect });
  mocks.publicSelect.mockReturnValue({ in: mocks.publicIn });
  mocks.publicIn.mockResolvedValue({ data: [], error: null });
});
it.each([
  { status: "signedOut" },
  { status: "pending" },
  { status: "active", role: "author", profileId: ownerId },
])("rejects non-editor access before querying the draft", async (access) => {
  mocks.access.mockResolvedValue(access);
  expect(await getEditorialArticlePreview(id)).not.toMatchObject({
    kind: "ok",
  });
  expect(mocks.from).not.toHaveBeenCalled();
});
it("checks a draft's standing before reading the public profiles", async () => {
  expect(await getEditorialArticlePreview(id)).toEqual({ kind: "notFound" });
  expect(mocks.eq).toHaveBeenCalledWith("status", "draft");
  expect(mocks.publicFrom).not.toHaveBeenCalled();
});
it("uses one authorized snapshot and one profile batch with multiple credits and media", async () => {
  const asset = {
    id: assetId,
    article_id: id,
    status: "finalized",
    width: 800,
    height: 600,
  };
  mocks.single.mockResolvedValue({
    data: {
      ...row,
      review_requested_at: "2026-11-24T12:00:00Z",
      article_contributors: [
        {
          contribution_role: "editor",
          display_order: 0,
          profile: {
            display_name: "Hidden editor",
            slug: "hidden-editor",
            active: true,
          },
        },
        {
          contribution_role: "writer",
          display_order: 1,
          profile: { display_name: "Writer", slug: "writer", active: true },
        },
      ],
      article_main_images: {
        alt_text: "Photograph",
        credit: "Photographer",
        caption: "Caption",
        asset_id: assetId,
        asset,
      },
      article_body_images: [
        { asset_id: assetId, asset },
        { asset_id: assetId, asset: { ...asset, article_id: editorId } },
      ],
    },
    error: null,
  });
  mocks.publicIn.mockResolvedValue({
    data: [{ slug: "writer", biography: "Public bio" }],
    error: null,
  });
  const result = await getEditorialArticlePreview(id);
  expect(result).toMatchObject({
    kind: "ok",
    article: {
      publishedAt: "2026-03-08T12:00:00Z",
      owner: { slug: "writer", biography: "Public bio" },
      contributors: [
        { displayName: "Hidden editor", slug: null },
        { displayName: "Writer", slug: "writer" },
      ],
      mainImage: { id: assetId, caption: "Caption" },
      bodyImages: [{ id: assetId }],
    },
  });
  expect(mocks.from).toHaveBeenCalledOnce();
  expect(mocks.limit).toHaveBeenCalledWith(33, {
    referencedTable: "article_contributors",
  });
  expect(mocks.publicIn).toHaveBeenCalledExactlyOnceWith("slug", [
    "writer",
    "hidden-editor",
  ]);
});
it.each(["editor", "administrator"])(
  "allows an authorized %s to see an unsubmitted draft",
  async (role) => {
    mocks.access.mockResolvedValue({
      status: "active",
      role,
      profileId: role === "editor" ? ownerId : editorId,
    });
    expect(await getEditorialArticlePreview(id)).toMatchObject({
      kind: "ok",
      article: { title: row.title },
    });
    expect(mocks.from).toHaveBeenCalledOnce();
  },
);
