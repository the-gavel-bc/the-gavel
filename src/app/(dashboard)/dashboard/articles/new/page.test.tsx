import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), options: vi.fn() }));
vi.mock("@/lib/auth/access/access", () => ({
  requireActiveMembership: mocks.guard,
}));
vi.mock("@/lib/articles/draft-queries/draft-queries", () => ({
  getDraftOptions: mocks.options,
}));
vi.mock("@/lib/articles/draft-actions/draft-actions", () => ({
  createDraftAction: vi.fn(),
  saveDraftAction: vi.fn(),
}));
vi.mock("@/components/dashboard/article-media/article-media", () => ({
  ArticleMedia: () => <section aria-label="Main image" />,
}));
vi.mock("next/navigation", async (load) => ({
  ...(await load<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
import Page from "./page";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue({ status: "active" });
  mocks.options.mockResolvedValue({
    sections: [],
    categories: [],
    tags: [],
    contributors: [],
  });
});
it("starts with blank required fields and no fabricated section", async () => {
  render(await Page());
  expect(screen.getByRole("heading", { name: "New draft" })).toBeVisible();
  expect(screen.getByLabelText(/Title/)).toHaveValue("");
  expect(screen.getByLabelText(/Section/)).toHaveValue("");
  expect(screen.getByRole("button", { name: "Create draft" })).toBeDisabled();
});
it("guards direct navigation independently before loading choices", async () => {
  mocks.guard.mockRejectedValue(new Error("redirect:/sign-in"));
  await expect(Page()).rejects.toThrow("redirect:/sign-in");
  expect(mocks.options).not.toHaveBeenCalled();
});
it("renders safe option-read recovery while preserving query guard redirects", async () => {
  mocks.options.mockRejectedValue(new Error("private SQL"));
  render(await Page());
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Unable to load draft options",
  );
  expect(screen.queryByText(/private SQL/)).not.toBeInTheDocument();
  const { redirect } = await import("next/navigation");
  mocks.options.mockImplementation(() => redirect("/access-pending"));
  await expect(Page()).rejects.toThrow("NEXT_REDIRECT");
});
