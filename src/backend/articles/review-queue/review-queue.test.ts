import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  client: vi.fn(),
  connection: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("redirect");
  }),
  rpc: vi.fn(),
}));
vi.mock("@/backend/auth/access/access", () => ({
  requireActiveMembership: mocks.guard,
}));
vi.mock("@/backend/infrastructure/supabase/server/server", () => ({
  createServerSupabaseClient: mocks.client,
}));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { getReviewQueue } from "./review-queue";

const item = {
  article_id: "5d000000-0000-0000-0000-000000000001",
  title: "Story",
  status: "draft",
  owner_name: "Writer",
  section_name: "News",
  submitted_at: "2026-10-23T12:00:00.000000Z",
  published_at: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue({ status: "active", role: "editor" });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: [item], error: null });
});

it("maps safe submitted and published rows into the editor queue", async () => {
  mocks.rpc.mockResolvedValueOnce({
    data: [
      item,
      {
        ...item,
        status: "published",
        submitted_at: null,
        published_at: "2026-10-23T12:00:00.000000Z",
      },
    ],
    error: null,
  });
  expect(await getReviewQueue()).toEqual([
    {
      id: item.article_id,
      title: "Story",
      status: "draft",
      ownerName: "Writer",
      sectionName: "News",
      at: item.submitted_at,
    },
    {
      id: item.article_id,
      title: "Story",
      status: "published",
      ownerName: "Writer",
      sectionName: "News",
      at: "2026-10-23T12:00:00.000000Z",
    },
  ]);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("list_review_articles");
});

it("redirects authors before reading and masks failed or malformed results", async () => {
  mocks.guard.mockResolvedValue({ status: "active", role: "author" });
  await expect(getReviewQueue()).rejects.toThrow("redirect");
  expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith("/dashboard");
  expect(mocks.rpc).not.toHaveBeenCalled();

  mocks.guard.mockResolvedValue({ status: "active", role: "administrator" });
  mocks.rpc.mockResolvedValueOnce({
    data: null,
    error: new Error("private SQL"),
  });
  await expect(getReviewQueue()).rejects.toThrow(
    "Unable to load the review queue.",
  );
  mocks.rpc.mockResolvedValueOnce({
    data: [{ ...item, article_id: "invalid" }],
    error: null,
  });
  await expect(getReviewQueue()).rejects.toThrow();
});

it.each([
  { ...item, submitted_at: null },
  { ...item, status: "published", submitted_at: null, published_at: null },
])("rejects a queue row without its status timestamp", async (row) => {
  mocks.guard.mockResolvedValue({ status: "active", role: "editor" });
  mocks.rpc.mockResolvedValueOnce({ data: [row], error: null });
  await expect(getReviewQueue()).rejects.toThrow();
});

it("reads a title with 240 Unicode code points", async () => {
  const title = "😀".repeat(240);
  mocks.rpc.mockResolvedValueOnce({ data: [{ ...item, title }], error: null });
  expect(await getReviewQueue()).toEqual([expect.objectContaining({ title })]);
});
