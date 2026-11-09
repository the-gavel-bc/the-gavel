import { Editor } from "@tiptap/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { createDraftExtensions } from "@/frontend/features/articles/draft-document/draft-extensions";
import { DraftToolbar } from "./draft-toolbar";
it("toggles only supported formatting through the actual editor", async () => {
  const editor = new Editor({
    extensions: createDraftExtensions(),
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Text" }] },
      ],
    },
  });
  editor.commands.selectAll();
  const view = render(
    <DraftToolbar editor={editor} disabled={false} onError={vi.fn()} />,
  );
  try {
    await userEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(editor.isActive("bold")).toBe(true);
    expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  } finally {
    view.unmount();
    editor.destroy();
  }
});
it("rejects unsafe URLs without adding a link", async () => {
  const error = vi.fn();
  const editor = new Editor({ extensions: createDraftExtensions() });
  const view = render(
    <DraftToolbar editor={editor} disabled={false} onError={error} />,
  );
  try {
    await userEvent.type(
      screen.getByLabelText("Link URL"),
      "javascript:alert(1)",
    );
    await userEvent.click(screen.getByRole("button", { name: "Apply link" }));
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ code: "invalid_input" }),
    );
    expect(editor.isActive("link")).toBe(false);
    expect(screen.getByLabelText("Link URL")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  } finally {
    view.unmount();
    editor.destroy();
  }
});
