import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import type { DraftDocument } from "@/shared/articles/draft-contract/draft-contract";
import { act } from "@testing-library/react";
import { expect, it, vi } from "vitest";
vi.mock("@/backend/media/media-actions/media-actions", () => ({
  requestArticleImageUpload: vi.fn(),
}));
vi.mock("@/backend/media/media-removal/media-removal", () => ({
  removeUnusedArticleImage: vi.fn(),
}));
const live = vi.hoisted(() => ({ editor: null as Editor | null }));
vi.mock("@tiptap/react", async (load) => {
  const actual = await load<typeof import("@tiptap/react")>();
  return {
    ...actual,
    useEditor: (...args: Parameters<typeof actual.useEditor>) => {
      const editor = actual.useEditor(...args);
      live.editor = editor;
      return editor;
    },
  };
});
vi.mock(
  "@/frontend/features/articles/draft-document/draft-document",
  async (load) => {
    const actual =
      await load<
        typeof import("@/frontend/features/articles/draft-document/draft-document")
      >();
    return { ...actual, toEditorDocument: vi.fn(actual.toEditorDocument) };
  },
);
import { toEditorDocument } from "@/frontend/features/articles/draft-document/draft-document";
import { DraftEditor } from "./draft-editor";
import { checkDraftInput } from "@/shared/articles/draft-contract/draft-contract";
import { baseDraft } from "@/shared/articles/draft-contract/draft-test-cases";
it("hydrates an empty editor without changing a NULL body", async () => {
  const change = vi.fn();
  render(
    <DraftEditor
      value={null}
      onChange={change}
      onError={vi.fn()}
      disabled={false}
    />,
  );
  expect(
    await screen.findByRole("textbox", { name: "Article body" }),
  ).toHaveAttribute("contenteditable", "true");
  expect(change).not.toHaveBeenCalled();
});
it("disables native editing and toolbar controls while pending", async () => {
  render(
    <DraftEditor value={null} onChange={vi.fn()} onError={vi.fn()} disabled />,
  );
  await waitFor(() =>
    expect(
      screen.getByRole("textbox", { name: "Article body" }),
    ).toHaveAttribute("contenteditable", "false"),
  );
  expect(screen.getByRole("button", { name: "Bold" })).toBeDisabled();
});
it("rejects HTML paste before it can create nodes or fetch resources", async () => {
  const error = vi.fn(),
    change = vi.fn();
  const view = render(
    <DraftEditor
      value={null}
      onChange={change}
      onError={error}
      disabled={false}
    />,
  );
  const body = await screen.findByRole("textbox", { name: "Article body" });
  const paste = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(paste, "clipboardData", {
    value: {
      files: [],
      getData: (type: string) =>
        type === "text/html"
          ? '<img src="https://example.org/track" onerror="alert(1)">'
          : "plain fallback",
    },
  });
  fireEvent(body, paste);
  await waitFor(() => expect(error).toHaveBeenCalled());
  expect(body.querySelector("img")).toBeNull();
  await waitFor(() => expect(body).toHaveAttribute("aria-invalid", "true"));
  expect(body).toHaveAccessibleDescription(/Paste was blocked/);
  view.rerender(
    <DraftEditor
      value={null}
      onChange={change}
      onError={error}
      disabled={false}
    />,
  );
  expect(body).toHaveAttribute("aria-invalid", "true");
  expect(body).toHaveAccessibleDescription(/Paste was blocked/);
  expect(change).not.toHaveBeenCalled();
});
it("does not load unknown stored content", async () => {
  const error = vi.fn();
  render(
    <DraftEditor
      value={{ format: "legacy" } as never}
      onChange={vi.fn()}
      onError={error}
      disabled={false}
    />,
  );
  expect(
    screen.queryByRole("textbox", { name: "Article body" }),
  ).not.toBeInTheDocument();
  await waitFor(() => expect(error).toHaveBeenCalled());
});

it("ignores delayed native echoes without discarding newer input but accepts an external document", async () => {
  const change = vi.fn(),
    error = vi.fn();
  const view = render(
    <DraftEditor
      value={null}
      onChange={change}
      onError={error}
      disabled={false}
    />,
  );
  await screen.findByRole("textbox", { name: "Article body" });
  act(() => {
    live.editor!.commands.insertContent({ type: "text", text: "First" });
  });
  const echo = change.mock.calls[0][0] as DraftDocument;
  expect(checkDraftInput({ ...baseDraft, content: echo }).ok).toBe(true);
  act(() => {
    live.editor!.commands.insertContent({ type: "text", text: "Second" });
  });
  const conversions = vi.mocked(toEditorDocument).mock.calls.length;
  view.rerender(
    <DraftEditor
      value={echo}
      onChange={change}
      onError={error}
      disabled={false}
    />,
  );
  expect(live.editor!.getText()).toBe("FirstSecond");
  expect(toEditorDocument).toHaveBeenCalledTimes(conversions);
  const external: DraftDocument = {
    format: "gavel-draft",
    version: 1,
    document: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "External" }] },
      ],
    },
  };
  view.rerender(
    <DraftEditor
      value={external}
      onChange={change}
      onError={error}
      disabled={false}
    />,
  );
  expect(live.editor!.getText()).toBe("External");
  expect(toEditorDocument).toHaveBeenCalledTimes(conversions + 1);
});

it("keeps invalid native input when a delayed echo or disabled state arrives", async () => {
  const change = vi.fn(),
    error = vi.fn();
  const view = render(
    <DraftEditor
      value={null}
      onChange={change}
      onError={error}
      disabled={false}
    />,
  );
  await screen.findByRole("textbox", { name: "Article body" });
  act(() => {
    live.editor!.commands.insertContent({ type: "text", text: "Valid" });
  });
  const echo = change.mock.calls[0][0] as DraftDocument;
  expect(checkDraftInput({ ...baseDraft, content: echo }).ok).toBe(true);
  act(() => {
    live.editor!.commands.setContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Invalid",
              marks: [
                {
                  type: "link",
                  attrs: { href: "https://example.org", target: "_self" },
                },
              ],
            },
          ],
        },
      ],
    });
  });
  await waitFor(() => expect(error).toHaveBeenCalled());
  const conversions = vi.mocked(toEditorDocument).mock.calls.length;
  view.rerender(
    <DraftEditor
      value={echo}
      onChange={change}
      onError={error}
      disabled={false}
    />,
  );
  expect(live.editor!.getText()).toBe("Invalid");
  expect(screen.getByRole("textbox", { name: "Article body" })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  view.rerender(
    <DraftEditor value={echo} onChange={change} onError={error} disabled />,
  );
  expect(live.editor!.getText()).toBe("Invalid");
  expect(live.editor!.isEditable).toBe(false);
  expect(toEditorDocument).toHaveBeenCalledTimes(conversions);
  expect(change).toHaveBeenCalledTimes(1);
});
