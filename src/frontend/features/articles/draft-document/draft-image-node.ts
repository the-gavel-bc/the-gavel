import { Extension, Node, type Editor } from "@tiptap/core";
import { dropCursor } from "@tiptap/pm/dropcursor";
import { gapCursor } from "@tiptap/pm/gapcursor";
import { NodeSelection, Plugin, TextSelection } from "@tiptap/pm/state";
import { isDraftUuid } from "../../../../shared/articles/draft-contract/draft-contract";

export type DraftImageAttrs = {
  assetId: string;
  alt: string;
  caption: string | null;
  credit: string | null;
  name: string | null;
};

const SVG = "http://www.w3.org/2000/svg";
function imageIcon() {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const [tag, attrs] of [
    ["rect", { x: "3", y: "4", width: "18", height: "16", rx: "2" }],
    ["circle", { cx: "9", cy: "10", r: "1.6" }],
    ["path", { d: "m4 18 5-5 3 3 3-3 5 5" }],
  ] as const) {
    const part = document.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(attrs))
      part.setAttribute(key, value);
    svg.append(part);
  }
  return svg;
}

/** The label shown in the editor: the uploaded file name, else the alt text. */
export function imageLabel(attrs: { alt: string; name?: string | null }) {
  return `[${attrs.name || attrs.alt}]`;
}

export function createDraftImageNode(articleId?: string) {
  return Node.create({
    name: "image",
    group: "block",
    atom: true,
    selectable: true,
    draggable: true,
    addAttributes() {
      return {
        assetId: { default: null },
        alt: { default: null },
        caption: { default: null },
        credit: { default: null },
        name: { default: null },
      };
    },
    parseHTML() {
      return [];
    },
    renderHTML({ node }) {
      return [
        "figure",
        { "data-asset-id": node.attrs.assetId },
        ["span", {}, node.attrs.alt],
      ];
    },
    addNodeView() {
      return ({ node }) => {
        // A one-line placeholder, not the photo, so images never push the
        // surrounding text out of view. Hovering or selecting it shows a
        // small preview; selecting it opens its settings beside it.
        const dom = document.createElement("div");
        dom.className = "draft-image-chip";
        dom.contentEditable = "false";
        const label = document.createElement("span");
        label.className = "draft-image-label";
        const description = document.createElement("span");
        description.className = "draft-image-sr";
        const preview = document.createElement("span");
        preview.className = "draft-image-preview";
        preview.setAttribute("aria-hidden", "true");
        const image = document.createElement("img");
        image.alt = "";
        preview.append(image);
        dom.append(imageIcon(), label, description, preview);
        const canPreview = Boolean(articleId && isDraftUuid(articleId));
        let current = node;
        // The preview loads only when first needed, and is placed against
        // the window so the scrolling body box cannot clip it.
        const load = () => {
          if (!canPreview || image.getAttribute("src")) return;
          image.src = `/api/articles/${articleId}/media/${current.attrs.assetId}`;
        };
        dom.addEventListener("mouseenter", () => {
          load();
          const rect = dom.getBoundingClientRect();
          preview.style.left = `${Math.max(8, rect.left)}px`;
          preview.style.top = `${rect.bottom + 4}px`;
        });
        const update = (next: typeof node) => {
          if (next.type.name !== "image") return false;
          const { assetId, alt } = next.attrs;
          if (!isDraftUuid(assetId) || typeof alt !== "string") return false;
          if (assetId !== current.attrs.assetId) image.removeAttribute("src");
          current = next;
          label.textContent = imageLabel(next.attrs as DraftImageAttrs);
          description.textContent = ` Image: ${alt}`;
          dom.title = alt;
          return true;
        };
        update(node);
        return {
          dom,
          update,
          selectNode() {
            dom.classList.add("ProseMirror-selectednode");
            load();
          },
          deselectNode() {
            dom.classList.remove("ProseMirror-selectednode");
          },
        };
      };
    },
  });
}

/**
 * Cursor behaviour around images: a gap cursor before and after them, a drop
 * line while dragging, and typing on a selected image starts a new paragraph
 * after it instead of replacing the image.
 */
export const DraftImageCursors = Extension.create({
  name: "draftImageCursors",
  addProseMirrorPlugins() {
    return [
      gapCursor(),
      dropCursor({ color: "#1e4aa8", width: 2 }),
      new Plugin({
        props: {
          handleTextInput(view, _from, _to, text) {
            const { selection } = view.state;
            if (
              !(selection instanceof NodeSelection) ||
              selection.node.type.name !== "image"
            )
              return false;
            const paragraph = view.state.schema.nodes.paragraph.create(
              null,
              view.state.schema.text(text),
            );
            const tr = view.state.tr.insert(selection.to, paragraph);
            tr.setSelection(
              TextSelection.create(tr.doc, selection.to + 1 + text.length),
            );
            view.dispatch(tr.scrollIntoView());
            return true;
          },
        },
      }),
    ];
  },
});

/**
 * Inserts an image at the cursor and leaves the cursor in a paragraph after
 * it, adding one when the image would otherwise end the body or sit next to
 * another block.
 */
export function insertDraftImage(editor: Editor, attrs: DraftImageAttrs) {
  return editor
    .chain()
    .focus(undefined, { scrollIntoView: false })
    .insertContent({ type: "image", attrs })
    .command(({ tr, state }) => {
      const { selection } = tr;
      const end =
        selection instanceof NodeSelection ? selection.to : selection.from;
      const after = tr.doc.resolve(end).nodeAfter;
      if (after?.isTextblock) {
        tr.setSelection(TextSelection.create(tr.doc, end + 1));
      } else {
        tr.insert(end, state.schema.nodes.paragraph.create());
        tr.setSelection(TextSelection.create(tr.doc, end + 1));
      }
      return true;
    })
    .scrollIntoView()
    .run();
}

/** Moves the selected image one block up or down within its parent. */
export function moveSelectedImage(editor: Editor, direction: -1 | 1) {
  const { state } = editor;
  const { selection } = state;
  if (
    !(selection instanceof NodeSelection) ||
    selection.node.type.name !== "image"
  )
    return false;
  const { $from } = selection;
  const index = $from.index();
  const target = index + direction;
  if (target < 0 || target >= $from.parent.childCount) return false;
  const neighbor = $from.parent.child(target);
  const node = selection.node;
  const tr = state.tr.delete(selection.from, selection.to);
  const at =
    direction < 0
      ? selection.from - neighbor.nodeSize
      : selection.from + neighbor.nodeSize;
  tr.insert(at, node);
  tr.setSelection(NodeSelection.create(tr.doc, at));
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

/** Where the selected image is and what it holds, or null. */
export function selectedDraftImage(editor: Editor) {
  const { selection } = editor.state;
  return selection instanceof NodeSelection &&
    selection.node.type.name === "image"
    ? {
        pos: selection.from,
        attrs: selection.node.attrs as DraftImageAttrs,
        index: selection.$from.index(),
        siblings: selection.$from.parent.childCount,
      }
    : null;
}
