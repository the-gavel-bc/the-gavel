import { Editor } from "@tiptap/core";
import { expect, it } from "vitest";
import { createDraftExtensions } from "@/lib/articles/draft-document/draft-extensions";
import { toEditorDocument } from "@/lib/articles/draft-document/draft-document";
import {
  draftJsonbByteLength,
  type DraftDocument,
} from "@/shared/articles/draft-contract/draft-contract";
import { insertDraftText } from "./draft-paste";
it("inserts plain text as text, never HTML", () => {
  const editor = new Editor({ extensions: createDraftExtensions() });
  try {
    expect(insertDraftText(editor.view, "<img src=x>\nSecond line")).toBeNull();
    expect(editor.getText()).toContain("<img src=x>");
    expect(editor.view.dom.querySelector("img")).toBeNull();
    expect(editor.getJSON().content).toHaveLength(2);
  } finally {
    editor.destroy();
  }
});
it("bounds newline allocation before creating nodes", () => {
  const editor = new Editor({ extensions: createDraftExtensions() });
  try {
    expect(insertDraftText(editor.view, "\n".repeat(100000))).toMatchObject({
      ok: false,
    });
    expect(editor.getJSON().content).toHaveLength(1);
  } finally {
    editor.destroy();
  }
});
it("rejects a prospective body overflow before dispatch without deleting existing input", () => {
  const content: DraftDocument = {
    format: "gavel-draft",
    version: 1,
    document: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "" }] }],
    },
  };
  const overhead = draftJsonbByteLength(content)!;
  const text = "a".repeat(1048576 - overhead);
  content.document.content[0] = {
    type: "paragraph",
    content: [{ type: "text", text }],
  };
  const loaded = toEditorDocument(content);
  if (!loaded.ok) throw new Error("Invalid synthetic fixture.");
  const editor = new Editor({
    extensions: createDraftExtensions(),
    content: loaded.document,
  });
  try {
    expect(insertDraftText(editor.view, "x")).toMatchObject({ ok: false });
    expect(editor.getText()).toHaveLength(text.length);
  } finally {
    editor.destroy();
  }
});
