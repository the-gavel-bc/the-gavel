import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
const m = vi.hoisted(() => ({
  save: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: m.push, refresh: m.refresh }),
}));
vi.mock("@/backend/articles/article-deletion/article-deletion-actions", () => ({
  deleteArticleAction: m.save,
}));
import { ArticleDeletion } from "./article-deletion";
const id = "84000000-0000-4000-8000-000000000002";
describe("archived article deletion", () => {
  beforeEach(() => vi.clearAllMocks());
  it("names the article in one confirmation and reports unavailable cleanup", async () => {
    m.save.mockResolvedValue({ ok: false, code: "cleanup_unavailable" });
    render(<ArticleDeletion articleId={id} title="Budget vote" version={1} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Permanently delete article" }),
    );
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Budget vote");
    expect(m.save).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Delete permanently" }),
    );
    expect(
      await screen.findByText(/media cleanup is unavailable/i),
    ).toBeInTheDocument();
  });
  it("retains an uncertain request for exact retry", async () => {
    m.save
      .mockResolvedValueOnce({ ok: false, code: "unavailable" })
      .mockResolvedValueOnce({ ok: true, articleId: id, replayed: true });
    render(<ArticleDeletion articleId={id} title="Budget vote" version={1} />);
    const deleteButton = screen.getByRole("button", {
      name: "Permanently delete article",
    });
    await userEvent.click(deleteButton);
    await userEvent.click(
      screen.getByRole("button", { name: "Delete permanently" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Retry deletion" }),
    );
    expect(deleteButton).toBeDisabled();
    await waitFor(() =>
      expect(m.push).toHaveBeenCalledWith(
        "/dashboard/admin/articles?deleted=1",
      ),
    );
    expect(m.save.mock.calls[0][0]).toEqual(m.save.mock.calls[1][0]);
  });
});
