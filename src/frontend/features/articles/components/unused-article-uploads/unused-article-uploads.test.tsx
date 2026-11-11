import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { UnusedArticleUploads } from "./unused-article-uploads";
const mocks = vi.hoisted(() => ({ list: vi.fn(), remove: vi.fn() }));
vi.mock(
  "@/backend/media/unused-article-uploads/unused-article-uploads",
  () => ({ listUnusedArticleUploads: mocks.list }),
);
vi.mock("@/backend/media/media-removal/media-removal", () => ({
  removeUnusedArticleImage: mocks.remove,
}));
const articleId = "50000000-0000-0000-0000-000000000401";
const assetId = "60000000-0000-0000-0000-000000000401";
const item = {
  assetId,
  createdAt: "2026-11-11T12:00:00Z",
  status: "finalized",
};
const props = {
  articleId,
  refreshKey: "1:false:false",
  localAssetIds: new Set<string>(),
  disabled: false,
  onBusyChange: vi.fn(),
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.list.mockResolvedValue({ ok: true, items: [item], nextCursor: null });
  mocks.remove.mockResolvedValue({ ok: true, assetId });
});
it("discovers after reload and discards only on explicit click", async () => {
  const view = render(<UnusedArticleUploads {...props} />);
  const button = await screen.findByRole("button", {
    name: "Discard unused upload",
  });
  expect(mocks.remove).not.toHaveBeenCalled();
  await userEvent.click(button);
  expect(mocks.remove).toHaveBeenCalledWith(assetId);
  expect(props.onBusyChange.mock.calls).toEqual([[true], [false]]);
  expect(screen.getByText("Unused upload discarded.")).toBeVisible();
  view.unmount();
  expect(mocks.remove).toHaveBeenCalledTimes(1);
});
it("hides unsaved body references and disables cleanup with held uploads or unresolved saves", async () => {
  const view = render(
    <UnusedArticleUploads {...props} localAssetIds={new Set([assetId])} />,
  );
  await screen.findByText(/No unused uploads/);
  expect(
    screen.queryByRole("button", { name: "Discard unused upload" }),
  ).not.toBeInTheDocument();
  view.rerender(<UnusedArticleUploads {...props} disabled />);
  expect(
    await screen.findByRole("button", { name: "Discard unused upload" }),
  ).toBeDisabled();
});
it("retains uncertain cleanup for explicit retry and explains an absent refreshed row", async () => {
  mocks.remove.mockResolvedValue({ ok: false, code: "unavailable" });
  render(<UnusedArticleUploads {...props} />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Discard unused upload" }),
  );
  expect(
    await screen.findByRole("button", { name: "Retry cleanup" }),
  ).toBeEnabled();
  mocks.list.mockResolvedValue({ ok: true, items: [], nextCursor: null });
  await userEvent.click(
    screen.getByRole("button", { name: "Refresh unused uploads" }),
  );
  expect(
    await screen.findByText(/Refreshing does not confirm deletion/),
  ).toBeVisible();
  expect(mocks.remove).toHaveBeenCalledTimes(1);
  expect(props.onBusyChange).toHaveBeenLastCalledWith(true);
  mocks.remove.mockResolvedValue({ ok: false, code: "not_found" });
  await userEvent.click(screen.getByRole("button", { name: "Retry cleanup" }));
  expect(
    await screen.findByText(/This does not confirm deletion/),
  ).toBeVisible();
  expect(props.onBusyChange).toHaveBeenLastCalledWith(false);
});
it("shows deleting retries, pages beyond locally hidden rows, and refreshes after writes", async () => {
  mocks.list.mockResolvedValueOnce({
    ok: true,
    items: [item],
    nextCursor: assetId,
  });
  const view = render(
    <UnusedArticleUploads {...props} localAssetIds={new Set([assetId])} />,
  );
  mocks.list.mockResolvedValue({
    ok: true,
    items: [{ ...item, status: "deleting" }],
    nextCursor: null,
  });
  await userEvent.click(
    await screen.findByRole("button", { name: "Next unused uploads" }),
  );
  expect(mocks.list).toHaveBeenLastCalledWith(articleId, assetId);
  view.rerender(<UnusedArticleUploads {...props} refreshKey="2:false:false" />);
  expect(
    await screen.findByRole("button", { name: "Retry cleanup" }),
  ).toBeEnabled();
  await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(3));
});
it("shows safe load and stale-reference failures", async () => {
  mocks.list.mockResolvedValueOnce({ ok: false, code: "forbidden" });
  render(<UnusedArticleUploads {...props} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load");
  await userEvent.click(
    screen.getByRole("button", { name: "Refresh unused uploads" }),
  );
  mocks.remove.mockResolvedValue({ ok: false, code: "conflict" });
  await userEvent.click(
    await screen.findByRole("button", { name: "Discard unused upload" }),
  );
  expect(
    await screen.findByText(/no longer available for unused cleanup/),
  ).toBeVisible();
});
it("holds busy guards until cleanup completes", async () => {
  let finish!: (value: { ok: true; assetId: string }) => void;
  mocks.remove.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<UnusedArticleUploads {...props} />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Discard unused upload" }),
  );
  expect(props.onBusyChange).toHaveBeenLastCalledWith(true);
  expect(
    screen.getByRole("button", { name: "Discard unused upload" }),
  ).toBeDisabled();
  await act(async () => finish({ ok: true, assetId }));
  expect(props.onBusyChange).toHaveBeenLastCalledWith(false);
});
