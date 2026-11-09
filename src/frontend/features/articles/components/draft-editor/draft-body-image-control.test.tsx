import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { Editor as LiveEditor } from "@tiptap/core";
import { createDraftExtensions } from "@/frontend/features/articles/draft-document/draft-extensions";
import { expect, it, vi } from "vitest";

const reserve = vi.hoisted(() => vi.fn());
vi.mock("@/backend/media/media-actions/media-actions", () => ({
  requestArticleImageUpload: reserve,
}));
vi.mock("@/backend/media/media-removal/media-removal", () => ({
  removeUnusedArticleImage: vi.fn(),
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
    fireEvent.click(screen.getByRole("button", { name: "Upload body image" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Insert body image" }),
      ).toBeEnabled(),
    );
    fireEvent.change(screen.getByLabelText("Body image alt text"), {
      target: { value: "Campus scene" },
    });
    fireEvent.change(screen.getByLabelText("Body image caption"), {
      target: { value: "At dusk" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Insert body image" }));
    expect(insertContent).toHaveBeenCalledWith({
      type: "image",
      attrs: {
        assetId: "60000000-0000-0000-0000-000000000701",
        alt: "Campus scene",
        caption: "At dusk",
      },
    });
  } finally {
    vi.unstubAllGlobals();
  }
});

it("updates and removes a selected image without accepting a URL", () => {
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
    expect(screen.getByLabelText("Body image alt text")).toHaveValue(
      "Original",
    );
    fireEvent.change(screen.getByLabelText("Body image alt text"), {
      target: { value: "Updated" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Update selected image" }),
    );
    expect(editor.getJSON().content?.[0].attrs?.alt).toBe("Updated");
    fireEvent.click(
      screen.getByRole("button", { name: "Remove selected image" }),
    );
    expect(
      editor.getJSON().content?.some((node) => node.type === "image"),
    ).toBe(false);
  } finally {
    editor.destroy();
  }
});
