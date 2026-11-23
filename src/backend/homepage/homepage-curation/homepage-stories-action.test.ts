import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  page: vi.fn(),
  images: vi.fn(),
}));
vi.mock("@/backend/auth/access/access", () => ({
  getCurrentAccess: mocks.access,
}));
vi.mock(
  "@/backend/articles/admin-article-queries/admin-article-queries",
  () => ({ getHomepageLibraryPage: mocks.page }),
);
vi.mock("./homepage-images", () => ({ getHomepageImageUrls: mocks.images }));
import { listHomepageStoriesAction } from "./homepage-stories-action";

const a = "83000000-0000-0000-0000-000000000001";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ status: "active", role: "administrator" });
  mocks.page.mockResolvedValue({
    items: [{ id: a, title: "Story", status: "published" }],
    nextCursor: "next",
  });
  mocks.images.mockResolvedValue({ [a]: "/api/public/articles/x/media/y" });
});

it("returns a page of twelve published stories with images", async () => {
  expect(await listHomepageStoriesAction({ search: "st" })).toEqual({
    ok: true,
    items: [
      {
        id: a,
        title: "Story",
        status: "published",
        imageUrl: "/api/public/articles/x/media/y",
      },
    ],
    nextCursor: "next",
  });
  expect(mocks.page).toHaveBeenCalledWith({
    search: "st",
  });
});

it("denies non-administrators before any query", async () => {
  mocks.access.mockResolvedValue({ status: "active", role: "author" });
  expect(await listHomepageStoriesAction({})).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(mocks.page).not.toHaveBeenCalled();
});

it("separates invalid input from outages and leaks nothing", async () => {
  mocks.page.mockRejectedValueOnce(new Error("Invalid admin article request."));
  expect(await listHomepageStoriesAction({ cursor: "bad" })).toEqual({
    ok: false,
    code: "invalid_input",
  });
  mocks.page.mockRejectedValueOnce(new Error("private database detail"));
  expect(await listHomepageStoriesAction({})).toEqual({
    ok: false,
    code: "unavailable",
  });
});
