import { beforeEach, expect, it, vi } from "vitest";
import { getArticleMainImage } from "./media-queries";

const articleId = "50000000-0000-0000-0000-000000000401";
const assetId = "60000000-0000-0000-0000-000000000401";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  client: vi.fn(),
  row: vi.fn(),
}));
vi.mock("@/backend/auth/access/access", () => ({
  requireActiveMembership: mocks.access,
}));
vi.mock("@/backend/infrastructure/supabase/server/server", () => ({
  createServerSupabaseClient: mocks.client,
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({ status: "active" });
  mocks.row.mockResolvedValue({
    data: {
      asset_id: assetId,
      alt_text: "Newsroom graphic",
      credit: "The Gavel",
      caption: null,
    },
    error: null,
  });
  mocks.client.mockResolvedValue({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.row }) }),
    }),
  });
});

it("returns only an article's private main-image metadata", async () => {
  expect(await getArticleMainImage(articleId)).toEqual({
    assetId,
    altText: "Newsroom graphic",
    credit: "The Gavel",
    caption: null,
  });
});

it("rejects malformed article IDs before opening a client", async () => {
  await expect(getArticleMainImage("forged")).rejects.toThrow(
    "Invalid article ID",
  );
  expect(mocks.client).not.toHaveBeenCalled();
});

it("returns null when no main image is attached", async () => {
  mocks.row.mockResolvedValue({ data: null, error: null });
  expect(await getArticleMainImage(articleId)).toBeNull();
});
