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
vi.mock("@/backend/media/media-actions/media-actions", () => ({
  requestArticleImageUpload: mocks.request,
  setArticleMainImage: mocks.setImage,
}));
vi.mock("@/backend/media/media-removal/media-removal", () => ({
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

it("keeps a failed cleanup reachable for retry", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ ok: false }, { status: 400 })),
  );
  mocks.removeUnused
    .mockResolvedValueOnce({ ok: false, code: "unavailable" })
    .mockResolvedValueOnce({ ok: true, assetId });
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
  expect(
    await screen.findByRole("button", { name: "Retry cleanup" }),
  ).toBeVisible();
  expect(screen.getByLabelText("Image file")).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Retry cleanup" }));
  expect(await screen.findByText("Unused upload removed.")).toBeVisible();
  expect(mocks.removeUnused).toHaveBeenCalledTimes(2);
});

it("offers reload after a version conflict instead of a stale retry", async () => {
  mocks.setImage.mockResolvedValue({ ok: false, code: "conflict" });
  const user = userEvent.setup();
  render(
    <ArticleMedia
      article={article}
      initialImage={{ assetId, altText: "Current", credit: "The Gavel" }}
      disabled={false}
      onCommit={vi.fn()}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Remove image" }));
  expect(
    await screen.findByRole("button", { name: "Reload draft" }),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Remove image" })).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("Reload to review");
  expect(
    screen.queryByRole("button", { name: "Retry image change" }),
  ).not.toBeInTheDocument();
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

it("replays the full image command despite changed metadata, props and disabled state", async () => {
  mocks.setImage
    .mockRejectedValueOnce(new Error("Lost response"))
    .mockResolvedValueOnce({
      ok: true,
      articleId: article.id,
      version: 3,
      updatedAt: "2026-11-03T12:01:00.000Z",
      replayed: true,
      changed: true,
    });
  const onCommit = vi.fn();
  const onBusyChange = vi.fn();
  const onDirtyChange = vi.fn();
  const props = {
    article,
    initialImage: { assetId, altText: "Current", credit: "The Gavel" },
    disabled: false,
    onCommit,
    onBusyChange,
    onDirtyChange,
  };
  const user = userEvent.setup();
  const { rerender } = render(<ArticleMedia {...props} />);
  fireEvent.change(screen.getByLabelText("Alt text"), {
    target: { value: "  Submitted alt  " },
  });
  await user.click(
    screen.getByRole("button", { name: "Update image details" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Image change could not be confirmed",
  );
  expect(onBusyChange).toHaveBeenLastCalledWith(true);
  const command = mocks.setImage.mock.calls[0][0];
  expect(command).toEqual({
    articleId: article.id,
    expectedVersion: article.version,
    requestId: expect.any(String),
    assetId,
    altText: "Submitted alt",
    credit: "The Gavel",
  });
  fireEvent.change(screen.getByLabelText("Alt text"), {
    target: { value: "Newer alt" },
  });
  rerender(
    <ArticleMedia {...props} article={{ ...article, version: 9 }} disabled />,
  );
  expect(screen.getByRole("button", { name: "Remove image" })).toBeDisabled();
  const retry = screen.getByRole("button", { name: "Retry image change" });
  expect(retry).toBeEnabled();
  await user.click(retry);
  await waitFor(() => expect(onCommit).toHaveBeenCalledOnce());
  expect(mocks.setImage).toHaveBeenNthCalledWith(2, command);
  expect(screen.getByLabelText("Alt text")).toHaveValue("Newer alt");
  expect(screen.getByLabelText("Image credit")).toHaveValue("The Gavel");
  expect(
    screen.getByText("Attached image: Submitted alt — The Gavel"),
  ).toBeVisible();
  expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  expect(onBusyChange).toHaveBeenLastCalledWith(false);
});

it("retains a pending attachment asset and blocks competing mutations until retry confirms it", async () => {
  mocks.setImage.mockResolvedValueOnce({ ok: false, code: "unavailable" });
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
    new File(["synthetic"], "pending.png", { type: "image/png" }),
  );
  await user.click(screen.getByRole("button", { name: "Upload image" }));
  await screen.findByText("Image ready to attach.");
  fireEvent.change(screen.getByLabelText("Alt text"), {
    target: { value: "  Submitted alt  " },
  });
  fireEvent.change(screen.getByLabelText("Image credit"), {
    target: { value: "  Submitted credit  " },
  });
  await user.click(screen.getByRole("button", { name: "Attach image" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("unavailable");
  const command = mocks.setImage.mock.calls[0][0];
  expect(screen.getByLabelText("Image file")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Upload image" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Attach image" })).toBeDisabled();
  const discard = screen.getByRole("button", { name: "Discard unused upload" });
  expect(discard).toBeDisabled();
  fireEvent.click(discard);
  expect(mocks.removeUnused).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Image credit"), {
    target: { value: "Newer credit" },
  });
  await user.click(screen.getByRole("button", { name: "Retry image change" }));
  await screen.findByText("Image attached.");
  expect(mocks.setImage).toHaveBeenNthCalledWith(2, command);
  expect(screen.getByLabelText("Alt text")).toHaveValue("Submitted alt");
  expect(screen.getByLabelText("Image credit")).toHaveValue("Newer credit");
  expect(
    screen.queryByRole("button", { name: "Discard unused upload" }),
  ).toBeNull();
  expect(mocks.request).toHaveBeenCalledOnce();
  expect(mocks.removeUnused).not.toHaveBeenCalled();
});

it("retries an unlink independently of newer image metadata and keeps those edits dirty", async () => {
  mocks.setImage.mockResolvedValueOnce({ ok: false, code: "unavailable" });
  const onDirtyChange = vi.fn();
  const user = userEvent.setup();
  const props = {
    article,
    initialImage: { assetId, altText: "Current", credit: "The Gavel" },
    disabled: false,
    onCommit: vi.fn(),
    onDirtyChange,
  };
  const { rerender } = render(<ArticleMedia {...props} />);
  await user.click(screen.getByRole("button", { name: "Remove image" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("unavailable");
  const command = mocks.setImage.mock.calls[0][0];
  expect(command).toEqual({
    articleId: article.id,
    expectedVersion: article.version,
    requestId: expect.any(String),
    assetId: null,
    altText: null,
    credit: null,
  });
  fireEvent.change(screen.getByLabelText("Image credit"), {
    target: { value: "New credit" },
  });
  rerender(<ArticleMedia {...props} article={{ ...article, version: 8 }} />);
  await user.click(screen.getByRole("button", { name: "Retry image change" }));
  await screen.findByText("Image removed.");
  expect(mocks.setImage).toHaveBeenNthCalledWith(2, command);
  expect(screen.getByLabelText("Alt text")).toHaveValue("");
  expect(screen.getByLabelText("Image credit")).toHaveValue("New credit");
  expect(screen.queryByText(/Attached image:/)).not.toBeInTheDocument();
  expect(onDirtyChange).toHaveBeenLastCalledWith(true);
});

it.each(["forbidden", "not_found"] as const)(
  "retains an uncertain command after %s and confirms the same command when recovery succeeds",
  async (code) => {
    const confirmed = {
      ok: true,
      articleId: article.id,
      version: 3,
      updatedAt: "2026-11-03T12:01:00.000Z",
      replayed: true,
      changed: true,
    };
    mocks.setImage
      .mockResolvedValueOnce({ ok: false, code: "unavailable" })
      .mockResolvedValueOnce({ ok: false, code })
      .mockResolvedValueOnce(confirmed);
    const onCommit = vi.fn();
    const onBusyChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ArticleMedia
        article={article}
        initialImage={{ assetId, altText: "Current", credit: "The Gavel" }}
        disabled={false}
        onCommit={onCommit}
        onBusyChange={onBusyChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Remove image" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("unavailable");
    const command = mocks.setImage.mock.calls[0][0];
    await user.click(
      screen.getByRole("button", { name: "Retry image change" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      `Original image change is still unconfirmed (${code})`,
    );
    expect(
      screen.getByRole("button", { name: "Retry image change" }),
    ).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Reload draft" })).toBeNull();
    expect(screen.getByRole("button", { name: "Remove image" })).toBeDisabled();
    expect(
      screen.getByText("Attached image: Current — The Gavel"),
    ).toBeVisible();
    expect(onCommit).not.toHaveBeenCalled();
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    await user.click(
      screen.getByRole("button", { name: "Retry image change" }),
    );
    await screen.findByText("Image removed.");
    expect(mocks.setImage).toHaveBeenNthCalledWith(2, command);
    expect(mocks.setImage).toHaveBeenNthCalledWith(3, command);
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(confirmed);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  },
);

it("clears a first-attempt access denial without claiming a commit", async () => {
  mocks.setImage.mockResolvedValueOnce({ ok: false, code: "forbidden" });
  const onCommit = vi.fn();
  const onBusyChange = vi.fn();
  const user = userEvent.setup();
  render(
    <ArticleMedia
      article={article}
      initialImage={{ assetId, altText: "Current", credit: "The Gavel" }}
      disabled={false}
      onCommit={onCommit}
      onBusyChange={onBusyChange}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Remove image" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("forbidden");
  expect(
    screen.queryByRole("button", { name: "Retry image change" }),
  ).toBeNull();
  expect(onCommit).not.toHaveBeenCalled();
  expect(onBusyChange).toHaveBeenLastCalledWith(false);
});

it("offers reload when an uncertain retry reaches the definitive version conflict check", async () => {
  mocks.setImage
    .mockResolvedValueOnce({ ok: false, code: "unavailable" })
    .mockResolvedValueOnce({ ok: false, code: "conflict" });
  const onCommit = vi.fn();
  const onBusyChange = vi.fn();
  const user = userEvent.setup();
  render(
    <ArticleMedia
      article={article}
      initialImage={{ assetId, altText: "Current", credit: "The Gavel" }}
      disabled={false}
      onCommit={onCommit}
      onBusyChange={onBusyChange}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Remove image" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("unavailable");
  const command = mocks.setImage.mock.calls[0][0];
  await user.click(screen.getByRole("button", { name: "Retry image change" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Reload to review",
  );
  expect(screen.getByRole("button", { name: "Reload draft" })).toBeEnabled();
  expect(
    screen.queryByRole("button", { name: "Retry image change" }),
  ).toBeNull();
  expect(screen.getByRole("button", { name: "Remove image" })).toBeDisabled();
  expect(mocks.setImage).toHaveBeenNthCalledWith(2, command);
  expect(onCommit).not.toHaveBeenCalled();
  expect(onBusyChange).toHaveBeenLastCalledWith(false);
});

it("retains the same file and reservation after throttling without cleanup", async () => {
  const user = userEvent.setup();
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json(
      { ok: false, code: "rate_limited", retryAfter: 60 },
      { status: 429 },
    ),
  );
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
    new File(["image"], "image.png", { type: "image/png" }),
  );
  await user.click(screen.getByRole("button", { name: "Upload image" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "retry the same file",
  );
  expect(mocks.removeUnused).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Retry upload" }));
  expect(await screen.findByText("Image ready to attach.")).toBeVisible();
  expect(mocks.request.mock.calls[1]).toEqual(mocks.request.mock.calls[0]);
});
