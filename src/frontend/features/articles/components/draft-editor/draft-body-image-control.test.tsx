import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

it("inserts only the finalized asset ID and bounded text into the body", async () => {
  const insertContent = vi.fn();
  const editor = {
    commands: { insertContent },
    getJSON: () => ({ type: "doc", content: [] }),
  } as unknown as Editor;
  reserve.mockResolvedValue({
    ok: true,
    assetId: "60000000-0000-0000-0000-000000000701",
  });
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ ok: true }),
  });
  vi.stubGlobal("fetch", fetcher);
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
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Insert body image" }),
      ).toBeEnabled(),
    );
    fireEvent.change(screen.getByLabelText("Body image alt text and caption"), {
      target: { value: "Campus scene" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Insert body image" }));
    expect(insertContent).toHaveBeenCalledWith({
      type: "image",
      attrs: {
        assetId: "60000000-0000-0000-0000-000000000701",
        alt: "Campus scene",
        caption: "Campus scene",
      },
    });
  } finally {
    vi.unstubAllGlobals();
  }
});

it("updates and removes a selected image without accepting a URL", async () => {
  const editor = new LiveEditor({
    extensions: createDraftExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "image",
          attrs: {
            assetId: "60000000-0000-0000-0000-000000000701",
            alt: "Original",
            caption: null,
          },
        },
      ],
    },
  });
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
    expect(
      screen.getByLabelText("Body image alt text and caption"),
    ).toHaveValue("Original");
    fireEvent.change(screen.getByLabelText("Body image alt text and caption"), {
      target: { value: "Updated" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Update selected image" }),
    );
    expect(editor.getJSON().content?.[0].attrs?.alt).toBe("Updated");
    const remove = screen.getByRole("button", { name: "Remove body image" });
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
