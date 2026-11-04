import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import type { DraftDocument } from "@/lib/articles/draft-contract/draft-contract";
import { act } from "@testing-library/react";
import { expect, it, vi } from "vitest";
vi.mock("@/lib/media/media-actions/media-actions", () => ({
  requestArticleImageUpload: vi.fn(),
}));
vi.mock("@/lib/media/media-removal/media-removal", () => ({
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
import { DraftEditor } from "./draft-editor";
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
  act(() => {
    live.editor!.commands.insertContent({ type: "text", text: "Second" });
  });
  view.rerender(
    <DraftEditor
      value={echo}
      onChange={change}
      onError={error}
      disabled={false}
    />,
  );
  expect(live.editor!.getText()).toBe("FirstSecond");
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
});
