import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { Editor as LiveEditor } from "@tiptap/core";
import { createDraftExtensions } from "@/frontend/features/articles/draft-document/draft-extensions";
import { expect, it, vi } from "vitest";
vi.mock(
  "@/frontend/components/ui/confirm-dialog/use-confirm",
  () => import("@/frontend/components/ui/confirm-dialog/use-confirm.window"),
);

const reserve = vi.hoisted(() => vi.fn());
const remove = vi.hoisted(() => vi.fn());
vi.mock("@/backend/media/media-actions/media-actions", () => ({
  requestArticleImageUpload: reserve,
}));
vi.mock("@/backend/media/media-removal/media-removal", () => ({
  removeUnusedArticleImage: remove,
}));
import { DraftBodyImageControl } from "./draft-body-image-control";

const ASSET = "60000000-0000-0000-0000-000000000701";
const liveEditor = (content: object[]) =>
  new LiveEditor({
    extensions: createDraftExtensions(),
    content: { type: "doc", content },
  });

it("inserts the finalized image with separate text, then keeps the cursor after it", async () => {
  const editor = liveEditor([
    { type: "paragraph", content: [{ type: "text", text: "Lead" }] },
  ]);
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  reserve.mockResolvedValue({ ok: true, assetId: ASSET });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    }),
  );
  try {
    render(
      <DraftBodyImageControl
        articleId="50000000-0000-0000-0000-000000000701"
        editor={editor}
        disabled={false}
        onError={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Body image file"), {
      target: {
        files: [new File(["image"], "campus-rally.png", { type: "image/png" })],
      },
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Insert body image" }),
      ).toBeEnabled(),
    );
    const panel = screen.getByRole("group", { name: "New body image" });
    fireEvent.change(within(panel).getByLabelText("Alt text"), {
      target: { value: "Students rally on the quad" },
    });
    fireEvent.change(within(panel).getByLabelText("Caption (optional)"), {
      target: { value: "  The rally drew hundreds.  " },
    });
    fireEvent.change(within(panel).getByLabelText("Credit (optional)"), {
      target: { value: "Jane Doe" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Insert body image" }));
    const content = editor.getJSON().content!;
    expect(content.map((node) => node.type)).toEqual([
      "paragraph",
      "image",
      "paragraph",
    ]);
    expect(content[1].attrs).toEqual({
      assetId: ASSET,
      alt: "Students rally on the quad",
      caption: "The rally drew hundreds.",
      credit: "Jane Doe",
      name: "campus-rally.png",
    });
    // The panel hides once the image is in the body.
    expect(
      screen.queryByRole("group", { name: "New body image" }),
    ).not.toBeInTheDocument();
  } finally {
    vi.unstubAllGlobals();
    editor.destroy();
  }
});

it("edits, moves and removes a selected image from its settings", async () => {
  const editor = liveEditor([
    { type: "paragraph", content: [{ type: "text", text: "One" }] },
    {
      type: "image",
      attrs: { assetId: ASSET, alt: "Original", caption: null },
    },
  ]);
  try {
    editor.commands.setNodeSelection(5);
    render(
      <DraftBodyImageControl
        articleId="50000000-0000-0000-0000-000000000701"
        editor={editor}
        disabled={false}
        onError={vi.fn()}
      />,
    );
    const settings = screen.getByRole("dialog", { name: "Image settings" });
    expect(within(settings).getByLabelText("Alt text")).toHaveValue("Original");
    expect(
      within(settings).getByRole("button", { name: "Move down" }),
    ).toBeDisabled();
    fireEvent.change(within(settings).getByLabelText("Alt text"), {
      target: { value: "Updated" },
    });
    fireEvent.change(within(settings).getByLabelText("Credit (optional)"), {
      target: { value: "Staff" },
    });
    fireEvent.click(
      within(settings).getByRole("button", { name: "Save image details" }),
    );
    expect(editor.getJSON().content?.[1].attrs).toMatchObject({
      alt: "Updated",
      caption: null,
      credit: "Staff",
    });
    // Saving closes the settings; selecting the image again reopens them.
    expect(
      screen.queryByRole("dialog", { name: "Image settings" }),
    ).not.toBeInTheDocument();
    act(() => {
      editor.commands.setTextSelection(1);
      editor.commands.setNodeSelection(5);
    });
    fireEvent.click(screen.getByRole("button", { name: "Move up" }));
    expect(editor.getJSON().content?.map((node) => node.type)).toEqual([
      "image",
      "paragraph",
    ]);
    const remove = screen.getByRole("button", { name: "Remove image" });
    expect(remove).toHaveAttribute("data-variant", "danger");
    fireEvent.click(remove);
    await waitFor(() =>
      expect(
        editor.getJSON().content?.some((node) => node.type === "image"),
      ).toBe(false),
    );
  } finally {
    editor.destroy();
  }
});

it("closes the settings with Escape", () => {
  const editor = liveEditor([
    { type: "image", attrs: { assetId: ASSET, alt: "Photo", caption: null } },
  ]);
  try {
    editor.commands.setNodeSelection(0);
    render(
      <DraftBodyImageControl
        articleId="50000000-0000-0000-0000-000000000701"
        editor={editor}
        disabled={false}
        onError={vi.fn()}
      />,
    );
    fireEvent.keyDown(screen.getByLabelText("Alt text"), { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Image settings" }),
    ).not.toBeInTheDocument();
  } finally {
    editor.destroy();
  }
});

it("keeps a throttled body upload retryable with the same reservation", async () => {
  reserve.mockReset();
  remove.mockReset();
  reserve.mockResolvedValue({
    ok: true,
    assetId: "60000000-0000-0000-0000-000000000701",
  });
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json(
        { ok: false, code: "rate_limited", retryAfter: 60 },
        { status: 429 },
      ),
    )
    .mockResolvedValueOnce(Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetcher);
  const editor = {
    commands: { insertContent: vi.fn() },
    getJSON: () => ({ type: "doc", content: [] }),
  } as unknown as Editor;
  try {
    render(
      <DraftBodyImageControl
        articleId="50000000-0000-0000-0000-000000000701"
        editor={editor}
        disabled={false}
        onError={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Body image file"), {
      target: {
        files: [new File(["image"], "image.png", { type: "image/png" })],
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "retry the same file",
    );
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retry upload" }));
    await screen.findByText("Image ready to insert.");
    expect(reserve.mock.calls[1]).toEqual(reserve.mock.calls[0]);
    remove.mockResolvedValue({ ok: true });
    const discard = screen.getByRole("button", { name: "Discard upload" });
    expect(discard).toHaveAttribute("data-variant", "danger");
    fireEvent.click(discard);
    expect(await screen.findByText("Upload discarded.")).toBeVisible();
    expect(
      screen.queryByText("Image ready to insert."),
    ).not.toBeInTheDocument();
  } finally {
    vi.unstubAllGlobals();
  }
});
