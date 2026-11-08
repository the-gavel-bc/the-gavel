import { Editor } from "@tiptap/core";
import { expect, it } from "vitest";
import { createDraftExtensions } from "./draft-extensions";
import { toEditorDocument, fromEditorDocument } from "./draft-document";
import { literalCases } from "../../../shared/articles/draft-contract/draft-test-cases";
import type { DraftDocument } from "../../../shared/articles/draft-contract/draft-contract";
it("enables exactly the accepted schema nodes and marks", () => {
  const editor = new Editor({ extensions: createDraftExtensions() });
  try {
    expect(Object.keys(editor.schema.nodes).sort()).toEqual([
      "blockquote",
      "bulletList",
      "doc",
      "hardBreak",
      "heading",
      "image",
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
it("keeps image IDs and text in the editor without accepting a source URL", () => {
  const editor = new Editor({
    extensions: createDraftExtensions("50000000-0000-0000-0000-000000000701"),
  });
  try {
    editor.commands.insertContent({
      type: "image",
      attrs: {
        assetId: "60000000-0000-0000-0000-000000000701",
        alt: "A photo",
        caption: "On campus",
      },
    });
    const result = fromEditorDocument(editor.getJSON());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.document.version).toBe(2);
    expect(JSON.stringify(editor.getJSON())).not.toContain("src");
    const image = editor.view.dom.querySelector("img");
    expect(image?.getAttribute("src")).toBe(
      "/api/articles/50000000-0000-0000-0000-000000000701/media/60000000-0000-0000-0000-000000000701",
    );
    image?.dispatchEvent(new Event("error"));
    expect(editor.view.dom.querySelector("figcaption")?.textContent).toBe(
      "Private image preview unavailable.",
    );
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
it("accepts a dense linked body despite native fixed-attribute overhead", () => {
  const content: DraftDocument = {
    format: "gavel-draft",
    version: 1,
    document: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: Array.from({ length: 2000 }, (_, n) => ({
            type: "text",
            text: "x".repeat(400),
            marks: [
              { type: "link", attrs: { href: `https://example.org/${n}` } },
            ],
          })),
        },
      ],
    },
  };
  const loaded = toEditorDocument(content);
  expect(loaded.ok).toBe(true);
  if (!loaded.ok) return;
  const editor = new Editor({
    extensions: createDraftExtensions(),
    content: loaded.document,
  });
  try {
    expect(fromEditorDocument(editor.getJSON()).ok).toBe(true);
  } finally {
    editor.destroy();
  }
});
