import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { baseDraft } from "@/shared/articles/draft-contract/draft-test-cases";
const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  detail: vi.fn(),
  options: vi.fn(),
  mainImage: vi.fn(),
}));
vi.mock("@/lib/media/media-queries/media-queries", () => ({
  getArticleMainImage: mocks.mainImage,
}));
vi.mock("@/components/dashboard/article-media/article-media", () => ({
  ArticleMedia: () => <section aria-label="Main image" />,
}));
vi.mock("@/lib/auth/access/access", () => ({
  requireActiveMembership: mocks.guard,
}));
vi.mock("@/lib/articles/draft-queries/draft-queries", () => ({
  getDraftDetail: mocks.detail,
  getDraftOptions: mocks.options,
}));
vi.mock("@/lib/articles/draft-actions/draft-actions", () => ({
  createDraftAction: vi.fn(),
  saveDraftAction: vi.fn(),
}));
vi.mock("next/navigation", async (load) => ({
  ...(await load<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
import Page from "./page";
const id = baseDraft.sectionId,
  params = { params: Promise.resolve({ id }) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue({ status: "active" });
  mocks.mainImage.mockResolvedValue(null);
  mocks.options.mockResolvedValue({
    sections: [{ id, name: "Synthetic" }],
    categories: [],
    tags: [],
    contributors: [],
  });
});
it("loads the same form with the current version for an editable draft", async () => {
  mocks.detail.mockResolvedValue({
    kind: "editable",
    articleId: id,
    version: 4,
    updatedAt: "2026-10-23T12:00:00Z",
    draft: baseDraft,
    unavailableSelections: {
      sectionId: null,
      categoryIds: [],
      tagIds: [],
      contributorIds: [],
    },
  });
  render(await Page(params));
  expect(screen.getByRole("heading", { name: "Edit draft" })).toBeVisible();
  expect(screen.getByLabelText(/Title/)).toHaveValue(baseDraft.title);
  expect(screen.getByRole("button", { name: "Save draft" })).toBeVisible();
});
it("opens a published article for editing without draft-only media controls", async () => {
  mocks.detail.mockResolvedValue({
    kind: "editable",
    status: "published",
    articleId: id,
    version: 4,
    updatedAt: "2026-10-23T12:00:00Z",
    draft: baseDraft,
    unavailableSelections: {
      sectionId: null,
      categoryIds: [],
      tagIds: [],
      contributorIds: [],
    },
  });
  render(await Page(params));
  expect(
    screen.getByRole("heading", { name: "Edit published article" }),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Save article" })).toBeVisible();
  expect(screen.queryByLabelText("Main image")).not.toBeInTheDocument();
});
it("keeps archived records read-only", async () => {
  mocks.detail.mockResolvedValue({ kind: "readOnly", status: "archived" });
  render(await Page(params));
  expect(screen.getByText(/archived/)).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Save draft" }),
  ).not.toBeInTheDocument();
});
it("preserves unsupported stored content without loading editing controls", async () => {
  mocks.detail.mockResolvedValue({
    kind: "unsupportedContent",
    status: "draft",
    articleId: id,
    version: 4,
  });
  render(await Page(params));
  expect(screen.getByRole("alert")).toHaveTextContent("preserved");
  expect(
    screen.queryByRole("button", { name: "Save draft" }),
  ).not.toBeInTheDocument();
});
it("allows an unsupported published article to be archived without exposing its body", async () => {
  mocks.detail.mockResolvedValue({
    kind: "unsupportedContent",
    status: "published",
    articleId: id,
    version: 4,
  });
  render(await Page(params));
  expect(screen.getByRole("button", { name: "Archive article" })).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Save article" }),
  ).not.toBeInTheDocument();
});
it("guards direct access and masks missing or invalid IDs", async () => {
  mocks.guard.mockRejectedValueOnce(new Error("redirect:/sign-in"));
  await expect(Page(params)).rejects.toThrow("redirect:/sign-in");
  mocks.detail.mockResolvedValue({ kind: "notFound" });
  await expect(Page(params)).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK");
  await expect(
    Page({ params: Promise.resolve({ id: "invalid" }) }),
  ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK");
});
it("offers deliberate repair controls for unavailable selections", async () => {
  mocks.detail.mockResolvedValue({
    kind: "editable",
    articleId: id,
    version: 1,
    updatedAt: "2026-10-23T12:00:00Z",
    draft: { ...baseDraft, categoryIds: [id] },
    unavailableSelections: {
      sectionId: id,
      categoryIds: [],
      tagIds: [],
      contributorIds: [],
    },
  });
  render(await Page(params));
  expect(screen.getByLabelText(`Unavailable category: ${id}`)).toBeChecked();
  expect(screen.getByRole("button", { name: "Save draft" })).toBeVisible();
});
