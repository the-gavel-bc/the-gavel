import { afterEach, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { createDraftExtensions } from "./draft-extensions";
import { fromEditorDocument } from "./draft-document";
import {
  imageLabel,
  insertDraftImage,
  moveSelectedImage,
  selectedDraftImage,
} from "./draft-image-node";

const attrs = {
  assetId: "60000000-0000-0000-0000-000000000701",
  alt: "Students on the quad",
  caption: null,
  credit: null,
  name: "rally.jpg",
};
let editor: Editor;
afterEach(() => editor?.destroy());
function setup(content: object[]) {
  editor = new Editor({ extensions: createDraftExtensions() });
  editor.commands.setContent({ type: "doc", content });
  return editor;
}
const types = () => editor.getJSON().content!.map((node) => node.type);
const text = (value: string) => ({
  type: "paragraph",
  content: [{ type: "text", text: value }],
});

it("leaves the cursor in a paragraph after an image inserted at the end", () => {
  setup([text("Before"), { type: "paragraph" }]);
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  insertDraftImage(editor, attrs);
  expect(types()).toEqual(["paragraph", "image", "paragraph"]);
  editor.commands.insertContent("After");
  expect(editor.getJSON().content![2]).toEqual(text("After"));
});

it("does not add an empty paragraph when text already follows", () => {
  setup([text("Before"), text("After")]);
  editor.commands.setTextSelection(7);
  insertDraftImage(editor, attrs);
  expect(types()).toEqual(["paragraph", "image", "paragraph"]);
  editor.commands.insertContent("X");
  expect(editor.getJSON().content![2]).toEqual(text("XAfter"));
});

it("types into a new paragraph after a selected image instead of replacing it", () => {
  setup([text("Before"), { type: "image", attrs }]);
  editor.commands.setNodeSelection(8);
  const { view } = editor;
  const handled = view.someProp("handleTextInput", (handler) =>
    handler(view, 8, 9, "A", () => view.state.tr),
  );
  expect(handled).toBe(true);
  expect(types()).toEqual(["paragraph", "image", "paragraph"]);
  expect(editor.getJSON().content![2]).toEqual(text("A"));
});

it("loads the gap cursor and drop cursor plugins", () => {
  setup([text("x")]);
  const specs = editor.state.plugins.map(
    (plugin) => plugin.spec as { props?: Record<string, unknown> },
  );
  // The gap cursor plugin is the one that builds selections between blocks.
  expect(specs.some((spec) => spec.props?.createSelectionBetween)).toBe(true);
  expect(
    specs.some((spec) => (spec as { view?: unknown }).view !== undefined),
  ).toBe(true);
});

it("moves a selected image up and down", () => {
  setup([text("One"), { type: "image", attrs }, text("Two")]);
  editor.commands.setNodeSelection(5);
  expect(moveSelectedImage(editor, 1)).toBe(true);
  expect(types()).toEqual(["paragraph", "paragraph", "image"]);
  expect(editor.state.selection).toBeInstanceOf(NodeSelection);
  expect(moveSelectedImage(editor, 1)).toBe(false);
  expect(moveSelectedImage(editor, -1)).toBe(true);
  expect(moveSelectedImage(editor, -1)).toBe(true);
  expect(types()).toEqual(["image", "paragraph", "paragraph"]);
  expect(selectedDraftImage(editor)).toMatchObject({ index: 0, siblings: 3 });
});

it("labels images by file name, falling back to alt text", () => {
  expect(imageLabel(attrs)).toBe("[rally.jpg]");
  expect(imageLabel({ alt: "Old photo", name: null })).toBe("[Old photo]");
});

it("saves without empty credit or name keys, and keeps set ones", () => {
  setup([{ type: "image", attrs }, { type: "paragraph" }]);
  const saved = fromEditorDocument(editor.getJSON());
  expect(saved.ok && saved.document.document.content[0]).toEqual({
    type: "image",
    attrs: {
      assetId: attrs.assetId,
      alt: attrs.alt,
      caption: null,
      name: "rally.jpg",
    },
  });
});
