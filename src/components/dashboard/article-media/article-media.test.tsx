import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { ArticleMedia } from "./article-media";

const article = {
  id: "50000000-0000-0000-0000-000000000401",
  version: 2,
  updatedAt: "2026-11-03T12:00:00.000Z",
};
const assetId = "60000000-0000-0000-0000-000000000401";
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  setImage: vi.fn(),
  removeUnused: vi.fn(),
}));
vi.mock("@/lib/media/media-actions/media-actions", () => ({
  requestArticleImageUpload: mocks.request,
  setArticleMainImage: mocks.setImage,
}));
vi.mock("@/lib/media/media-removal/media-removal", () => ({
  removeUnusedArticleImage: mocks.removeUnused,
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.request.mockResolvedValue({
    ok: true,
    assetId,
    status: "pending",
    replayed: false,
  });
  mocks.setImage.mockResolvedValue({
    ok: true,
    articleId: article.id,
    version: 3,
    updatedAt: "2026-11-03T12:01:00.000Z",
    replayed: false,
    changed: true,
  });
  mocks.removeUnused.mockResolvedValue({ ok: true, assetId });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(Response.json({ ok: true, assetId, replayed: false })),
  );
});

it("discards a finalized upload that was never attached", async () => {
  const user = userEvent.setup();
  render(
    <ArticleMedia
      article={article}
      initialImage={null}
      disabled={false}
      onCommit={vi.fn()}
    />,
  );
  await user.upload(
    screen.getByLabelText("Image file"),
    new File(["synthetic"], "unused.png", { type: "image/png" }),
  );
  await user.click(screen.getByRole("button", { name: "Upload image" }));
  await screen.findByText("Image ready to attach.");
  await user.click(
    screen.getByRole("button", { name: "Discard unused upload" }),
  );
  expect(await screen.findByText("Unused upload removed.")).toBeInTheDocument();
  expect(mocks.removeUnused).toHaveBeenCalledWith(assetId);
  expect(mocks.setImage).not.toHaveBeenCalled();
});

it("rejects invalid image bytes and cleans the unused reservation", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ ok: false, code: "invalid_input" }, { status: 400 }),
      ),
  );
  const user = userEvent.setup();
  render(
    <ArticleMedia
      article={article}
      initialImage={null}
      disabled={false}
      onCommit={vi.fn()}
    />,
  );
  await user.upload(
    screen.getByLabelText("Image file"),
    new File(["bad"], "bad.png", { type: "image/png" }),
  );
  await user.click(screen.getByRole("button", { name: "Upload image" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Choose a valid JPEG",
  );
  expect(mocks.removeUnused).toHaveBeenCalledWith(assetId);
  expect(screen.getByLabelText("Image file")).toBeEnabled();
});

it("uploads a file, requires alt and credit, then attaches the finalized asset", async () => {
  const onCommit = vi.fn();
  const user = userEvent.setup();
  render(
    <ArticleMedia
      article={article}
      initialImage={null}
      disabled={false}
      onCommit={onCommit}
    />,
  );
  await user.upload(
    screen.getByLabelText("Image file"),
    new File(["synthetic"], "headline.png", { type: "image/png" }),
  );
  await user.click(screen.getByRole("button", { name: "Upload image" }));
  expect(await screen.findByText("Image ready to attach.")).toBeInTheDocument();
  expect(mocks.request).toHaveBeenCalledOnce();
  const [url] = vi.mocked(fetch).mock.calls[0];
  expect(String(url)).toBe(`/api/articles/${article.id}/media/${assetId}`);
  await user.click(screen.getByRole("button", { name: "Attach image" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Alt text and credit are required.",
  );
  expect(mocks.setImage).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText("Alt text"), "Newsroom graphic");
  await user.type(screen.getByLabelText("Image credit"), "The Gavel");
  await user.click(screen.getByRole("button", { name: "Attach image" }));
  await waitFor(() => expect(onCommit).toHaveBeenCalledOnce());
  expect(mocks.setImage).toHaveBeenCalledWith(
    expect.objectContaining({
      articleId: article.id,
      expectedVersion: 2,
      assetId,
      altText: "Newsroom graphic",
      credit: "The Gavel",
    }),
  );
});

it("blocks image mutations while the draft has unsaved changes", async () => {
  render(
    <ArticleMedia
      article={article}
      initialImage={{ assetId, altText: "Current", credit: "The Gavel" }}
      disabled
      onCommit={vi.fn()}
    />,
  );
  expect(screen.getByRole("button", { name: "Remove image" })).toBeDisabled();
  expect(
    screen.getByText(/Save your draft changes before managing its image/),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Remove image" }));
  expect(mocks.setImage).not.toHaveBeenCalled();
});

it("clears the media navigation guard after a confirmed unlink", async () => {
  const onDirtyChange = vi.fn();
  const user = userEvent.setup();
  render(
    <ArticleMedia
      article={article}
      initialImage={{ assetId, altText: "Current", credit: "The Gavel" }}
      disabled={false}
      onCommit={vi.fn()}
      onDirtyChange={onDirtyChange}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Remove image" }));
  expect(await screen.findByText("Image removed.")).toBeInTheDocument();
  expect(onDirtyChange).toHaveBeenLastCalledWith(false);
});
