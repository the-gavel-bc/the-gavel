import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock(
  "@/backend/articles/article-correction/article-correction-actions",
  () => ({ saveArticleCorrectionAction: mocks.save }),
);
import { ArticleCorrection } from "./article-correction";

const articleId = "00000000-0000-4000-8000-000000000001";
beforeEach(() => vi.clearAllMocks());

it("adds a correction, sending what it loaded as the expected value", async () => {
  mocks.save.mockResolvedValue({ ok: true, changed: true });
  render(<ArticleCorrection articleId={articleId} correction={null} />);
  const save = screen.getByRole("button", { name: "Add correction" });
  expect(save).toBeDisabled();
  await userEvent.type(screen.getByRole("textbox"), "Fixed a date.");
  await userEvent.click(screen.getByRole("button", { name: "Add correction" }));
  expect(mocks.save).toHaveBeenCalledWith(
    expect.objectContaining({
      articleId,
      expectedCorrection: null,
      correction: "Fixed a date.",
    }),
  );
  expect(await screen.findByText("Correction saved.")).toBeVisible();
  expect(mocks.refresh).toHaveBeenCalled();
});

it("removes an existing correction by clearing the text", async () => {
  mocks.save.mockResolvedValue({ ok: true, changed: true });
  render(<ArticleCorrection articleId={articleId} correction="Old note" />);
  await userEvent.clear(screen.getByRole("textbox"));
  await userEvent.click(
    screen.getByRole("button", { name: "Remove correction" }),
  );
  expect(mocks.save).toHaveBeenCalledWith(
    expect.objectContaining({ expectedCorrection: "Old note", correction: "" }),
  );
});

it("retries an uncertain result with the same request id", async () => {
  mocks.save.mockResolvedValueOnce({ ok: false, code: "unavailable" });
  mocks.save.mockResolvedValueOnce({ ok: true, changed: true });
  render(<ArticleCorrection articleId={articleId} correction={null} />);
  await userEvent.type(screen.getByRole("textbox"), "Note");
  await userEvent.click(screen.getByRole("button", { name: "Add correction" }));
  await userEvent.click(
    await screen.findByRole("button", { name: "Retry original request" }),
  );
  expect(mocks.save).toHaveBeenCalledTimes(2);
  expect(mocks.save.mock.calls[1][0].requestId).toBe(
    mocks.save.mock.calls[0][0].requestId,
  );
});

it("explains a conflict", async () => {
  mocks.save.mockResolvedValue({ ok: false, code: "conflict" });
  render(<ArticleCorrection articleId={articleId} correction="Old" />);
  await userEvent.type(screen.getByRole("textbox"), " more");
  await userEvent.click(
    screen.getByRole("button", { name: "Save correction" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Someone else changed this correction",
  );
});
