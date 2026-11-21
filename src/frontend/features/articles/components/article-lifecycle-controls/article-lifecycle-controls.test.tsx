import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock(
  "@/frontend/components/ui/confirm-dialog/use-confirm",
  () => import("@/frontend/components/ui/confirm-dialog/use-confirm.window"),
);

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  archive: vi.fn(),
  restore: vi.fn(),
  submit: vi.fn(),
  returned: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));
vi.mock(
  "@/backend/articles/article-lifecycle/article-lifecycle-actions",
  () => ({
    publishArticleAction: mocks.publish,
    archiveArticleAction: mocks.archive,
    restoreArticleAction: mocks.restore,
    submitArticleAction: mocks.submit,
    returnArticleAction: mocks.returned,
  }),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }),
}));
import { ArticleLifecycleControls } from "./article-lifecycle-controls";

const articleId = "00000000-0000-0000-0000-000000000123";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true),
  );
});
it("requires confirmation and blocks unsaved work", async () => {
  const { rerender } = render(
    <ArticleLifecycleControls
      articleId={articleId}
      version={1}
      status="draft"
      disabled
    />,
  );
  expect(
    screen.getByRole("button", { name: "Publish article" }),
  ).toBeDisabled();
  rerender(
    <ArticleLifecycleControls
      articleId={articleId}
      version={1}
      status="draft"
      publicationDate="2026-11-04"
      disabled={false}
    />,
  );
  vi.mocked(window.confirm).mockReturnValueOnce(false);
  await userEvent.click(
    screen.getByRole("button", { name: "Publish article" }),
  );
  expect(mocks.publish).not.toHaveBeenCalled();
});
it("retries one uncertain publication with the exact command", async () => {
  mocks.publish
    .mockResolvedValueOnce({ ok: false, code: "unavailable" })
    .mockResolvedValueOnce({
      ok: true,
      articleId,
      status: "published",
      version: 2,
      updatedAt: "2026-11-04T12:00:00Z",
      changed: true,
      replayed: true,
    });
  render(
    <ArticleLifecycleControls
      articleId={articleId}
      version={1}
      status="draft"
      publicationDate="2026-11-04"
      disabled={false}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Publish article" }),
  );
  const retry = await screen.findByRole("button", {
    name: "Retry original publish",
  });
  expect(screen.getByRole("alert")).toHaveTextContent(/could not confirm/i);
  await userEvent.click(retry);
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  expect(mocks.publish.mock.calls[1][0]).toEqual(
    mocks.publish.mock.calls[0][0],
  );
  expect(window.confirm).toHaveBeenCalledOnce();
  expect(window.confirm).toHaveBeenCalledWith(
    expect.stringContaining("Publication date: 2026-11-04"),
  );
  expect(window.confirm).toHaveBeenCalledWith(
    expect.stringContaining("Publication date: 2026-11-04"),
  );
  expect(screen.getByRole("status")).toHaveTextContent(/published/i);
});
it("offers reload after a stale archive and preserves the expected version", async () => {
  mocks.archive.mockResolvedValue({ ok: false, code: "conflict" });
  render(
    <ArticleLifecycleControls
      articleId={articleId}
      version={4}
      status="published"
      disabled={false}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Archive article" }),
  );
  expect(mocks.archive.mock.calls[0][0]).toMatchObject({
    articleId,
    expectedVersion: 4,
  });
  expect(screen.getByRole("alert")).toHaveTextContent(/changed elsewhere/i);
  await userEvent.click(screen.getByRole("button", { name: "Reload article" }));
  expect(mocks.refresh).toHaveBeenCalledOnce();
});

it("keeps the original retry after access changes during an uncertain archive", async () => {
  mocks.archive
    .mockResolvedValueOnce({ ok: false, code: "unavailable" })
    .mockResolvedValueOnce({ ok: false, code: "forbidden" });
  render(
    <ArticleLifecycleControls
      articleId={articleId}
      version={4}
      status="published"
      disabled={false}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Archive article" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Retry original archive" }),
  );
  expect(
    screen.getByRole("button", { name: "Retry original archive" }),
  ).toBeEnabled();
  expect(mocks.archive.mock.calls[1][0]).toEqual(
    mocks.archive.mock.calls[0][0],
  );
});

it("holds the editor busy through a confirmed transition", async () => {
  let resolve!: (value: unknown) => void;
  const onBusyChange = vi.fn();
  mocks.publish.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(
    <ArticleLifecycleControls
      articleId={articleId}
      version={1}
      status="draft"
      disabled={false}
      onBusyChange={onBusyChange}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Publish article" }),
  );
  expect(onBusyChange).toHaveBeenCalledWith(true);
  expect(screen.getByRole("button", { name: /Publishing/ })).toBeDisabled();
  resolve({
    ok: true,
    articleId,
    status: "published",
    version: 2,
    updatedAt: "2026-11-04T12:00:00Z",
    changed: true,
    replayed: false,
  });
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  expect(onBusyChange).not.toHaveBeenCalledWith(false);
});

it("restores an archive with confirmation and exact uncertain retry", async () => {
  mocks.restore
    .mockResolvedValueOnce({ ok: false, code: "unavailable" })
    .mockResolvedValueOnce({
      ok: true,
      articleId,
      status: "published",
      version: 5,
      updatedAt: "2026-11-05T12:00:00Z",
      changed: true,
      replayed: true,
    });
  render(
    <ArticleLifecycleControls
      articleId={articleId}
      version={4}
      status="archived"
      disabled={false}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Restore article" }),
  );
  expect(window.confirm).toHaveBeenCalledWith(
    "Restore this article to Published? It will be visible to readers again.",
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Retry original restore" }),
  );
  expect(mocks.restore.mock.calls[1][0]).toEqual(
    mocks.restore.mock.calls[0][0],
  );
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
});
it("lets an author submit for review but never publish", async () => {
  mocks.submit.mockResolvedValue({
    ok: true,
    articleId,
    status: "draft",
    version: 2,
    updatedAt: "2026-10-22T12:00:00.123456Z",
    replayed: false,
    changed: true,
  });
  render(
    <ArticleLifecycleControls
      articleId={articleId}
      version={1}
      status="draft"
      capabilities={{ submit: true }}
      disabled={false}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "Publish article" }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Submit for review" }),
  );
  await waitFor(() =>
    expect(mocks.submit).toHaveBeenCalledWith(
      expect.objectContaining({ articleId, expectedVersion: 1 }),
    ),
  );
});
it("returns an article to its author with a note", async () => {
  mocks.returned.mockResolvedValue({ ok: false, code: "conflict" });
  render(
    <ArticleLifecycleControls
      articleId={articleId}
      version={3}
      status="draft"
      capabilities={{ publish: true, returnToAuthor: true }}
      disabled={false}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Return to author" }),
  );
  await waitFor(() =>
    expect(mocks.returned).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: 3, note: "Please revise." }),
    ),
  );
  expect(mocks.publish).not.toHaveBeenCalled();
});

it.each([false, true])(
  "navigates to the review queue only after a successful return (%s)",
  async (ok) => {
    mocks.returned.mockResolvedValue(
      ok
        ? {
            ok: true,
            articleId,
            status: "draft",
            version: 2,
            updatedAt: "2026-11-19T12:00:00Z",
            changed: true,
            replayed: false,
          }
        : { ok: false, code: "conflict" },
    );
    render(
      <ArticleLifecycleControls
        articleId={articleId}
        status="draft"
        version={1}
        disabled={false}
        capabilities={{
          submit: false,
          publish: false,
          archive: false,
          restore: false,
          returnToAuthor: true,
        }}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Return to author/ }),
    );
    if (ok) expect(mocks.push).toHaveBeenCalledWith("/dashboard/review");
    else {
      expect(screen.getByRole("alert")).toBeVisible();
      expect(mocks.push).not.toHaveBeenCalled();
    }
    expect(mocks.refresh).not.toHaveBeenCalled();
  },
);

it.each(["conflict", "unavailable"])(
  "preserves the submit receipt when publish returns %s",
  async (code) => {
    mocks.submit
      .mockResolvedValueOnce({ ok: false, code: "unavailable" })
      .mockResolvedValueOnce({ ok: false, code: "forbidden" });
    mocks.publish.mockResolvedValueOnce({ ok: false, code });
    render(
      <ArticleLifecycleControls
        articleId={articleId}
        version={1}
        status="draft"
        disabled={false}
        capabilities={{
          submit: true,
          publish: true,
          archive: false,
          restore: false,
          returnToAuthor: false,
        }}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Submit for review/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Publish article" }),
    );
    if (code === "conflict") {
      expect(
        screen.getByRole("button", { name: "Publish article" }),
      ).toBeEnabled();
    } else {
      expect(
        screen.getByRole("button", { name: "Retry original publish" }),
      ).toBeEnabled();
    }
    await userEvent.click(
      screen.getByRole("button", { name: "Retry original submit" }),
    );
    expect(mocks.submit.mock.calls[1][0]).toEqual(
      mocks.submit.mock.calls[0][0],
    );
    expect(window.confirm).toHaveBeenCalledTimes(2);
  },
);
