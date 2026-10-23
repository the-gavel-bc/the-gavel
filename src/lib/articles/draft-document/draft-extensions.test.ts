import { Editor } from "@tiptap/core";
import { expect, it } from "vitest";
import { createDraftExtensions } from "./draft-extensions";
import { toEditorDocument, fromEditorDocument } from "./draft-document";
import { literalCases } from "../draft-contract/draft-test-cases";
import type { DraftDocument } from "../draft-contract/draft-contract";
it("enables exactly the accepted schema nodes and marks", () => {
  const editor = new Editor({ extensions: createDraftExtensions() });
  try {
    expect(Object.keys(editor.schema.nodes).sort()).toEqual([
      "blockquote",
      "bulletList",
      "doc",
      "hardBreak",
      "heading",
      "listItem",
      "orderedList",
      "paragraph",
      "text",
    ]);
    expect(Object.keys(editor.schema.marks).sort()).toEqual([
      "bold",
      "italic",
      "link",
    ]);
  } finally {
    editor.destroy();
  }
});
for (const fixture of literalCases.filter(
  (c) => c.target === "content" && c.want === "ok",
))
  it(`engine round trip: ${fixture.name}`, () => {
    const content = fixture.value as DraftDocument | null;
    const loaded = toEditorDocument(content);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const editor = new Editor({
      extensions: createDraftExtensions(),
      content: loaded.document,
      enableContentCheck: true,
    });
    try {
      const result = fromEditorDocument(editor.getJSON());
      expect(result.ok).toBe(true);
      if (result.ok) {
        const restored = toEditorDocument(result.document);
        expect(restored.ok).toBe(true);
        if (restored.ok)
          expect(
            editor.schema.nodeFromJSON(restored.document).toJSON(),
          ).toEqual(editor.getJSON());
      }
    } finally {
      editor.destroy();
    }
  });
it("exports fixed link/list defaults and a hard break after formatted text", () => {
  const editor = new Editor({ extensions: createDraftExtensions() });
  try {
    editor.commands.insertContent({
      type: "text",
      text: "Bold",
      marks: [{ type: "bold" }],
    });
    editor.commands.setHardBreak();
    editor.commands.insertContent("after");
    expect(fromEditorDocument(editor.getJSON()).ok).toBe(true);
  } finally {
    editor.destroy();
  }
});
