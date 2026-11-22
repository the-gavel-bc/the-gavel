import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  archive: vi.fn(),
  restore: vi.fn(),
  remove: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock(
  "@/backend/articles/article-lifecycle/article-lifecycle-actions",
  () => ({
    archiveArticleAction: mocks.archive,
    restoreArticleAction: mocks.restore,
  }),
);
vi.mock("@/backend/articles/article-deletion/article-deletion-actions", () => ({
  deleteArticleAction: mocks.remove,
}));
import { ArticleRowActions } from "./article-row-actions";

const base = {
  id: "00000000-0000-0000-0000-000000000002",
  title: "Budget vote",
  version: 3,
};
beforeEach(() => vi.clearAllMocks());

it("offers Edit and Archive on a published article, archives only after confirming", async () => {
  mocks.archive.mockResolvedValue({ ok: true });
  render(
    <ArticleRowActions
      article={{ ...base, status: "published" }}
      admin={false}
    />,
  );
  expect(
    screen.getByRole("link", { name: "Edit article: Budget vote" }),
  ).toHaveAttribute("href", `/dashboard/articles/${base.id}`);
  expect(
    screen.queryByRole("button", { name: /Delete/ }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Archive article: Budget vote" }),
  );
  await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));
  expect(mocks.archive).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Archive article: Budget vote" }),
  );
  await userEvent.click(await screen.findByRole("button", { name: "Archive" }));
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  expect(mocks.archive).toHaveBeenCalledWith(
    expect.objectContaining({ articleId: base.id, expectedVersion: 3 }),
  );
});

it("gives administrators Restore and permanent Delete on an archive, with a confirmation", async () => {
  mocks.remove.mockResolvedValue({ ok: false, code: "media_cleanup_required" });
  render(<ArticleRowActions article={{ ...base, status: "archived" }} admin />);
  expect(screen.queryByRole("link", { name: /Edit/ })).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Restore article: Budget vote" }),
  ).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Delete article: Budget vote" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Delete permanently" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(/media history/);
  expect(mocks.remove).toHaveBeenCalledWith(
    expect.objectContaining({ articleId: base.id, confirm: true }),
  );
  expect(mocks.refresh).not.toHaveBeenCalled();
});

it("shows only Edit on a draft and nothing destructive to authors on an archive", () => {
  const { rerender } = render(
    <ArticleRowActions article={{ ...base, status: "draft" }} admin />,
  );
  expect(
    screen.getByRole("link", { name: "Edit draft: Budget vote" }),
  ).toBeVisible();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  rerender(
    <ArticleRowActions
      article={{ ...base, status: "archived" }}
      admin={false}
    />,
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it.each([false, true])(
  "offers an editor Archive only when they published it (%s)",
  (publishedByMe) => {
    render(
      <ArticleRowActions
        article={{ ...base, status: "published", publishedByMe }}
        admin={false}
        role="editor"
      />,
    );
    expect(
      Boolean(screen.queryByRole("button", { name: /Archive article/ })),
    ).toBe(publishedByMe);
  },
);

it("keeps archive actions disabled after a successful permanent deletion", async () => {
  mocks.remove.mockResolvedValue({ ok: true });
  render(<ArticleRowActions article={{ ...base, status: "archived" }} admin />);
  const remove = screen.getByRole("button", {
    name: "Delete article: Budget vote",
  });
  await userEvent.click(remove);
  await userEvent.click(
    screen.getByRole("button", { name: "Delete permanently" }),
  );
  expect(remove).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Restore article: Budget vote" }),
  ).toBeDisabled();
  expect(mocks.remove).toHaveBeenCalledTimes(1);
});
