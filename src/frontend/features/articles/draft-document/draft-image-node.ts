import { Node } from "@tiptap/core";
import { isDraftUuid } from "../../../../shared/articles/draft-contract/draft-contract";

export function createDraftImageNode(articleId?: string) {
  return Node.create({
    name: "image",
    group: "block",
    atom: true,
    selectable: true,
    addAttributes() {
      return {
        assetId: { default: null },
        alt: { default: null },
        caption: { default: null },
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
        // A compact chip (thumbnail and label), not the full-size photo, so
        // images do not push the surrounding text out of view while editing.
        const figure = document.createElement("figure");
        figure.className = "draft-image-chip";
        const caption = document.createElement("figcaption");
        const image = document.createElement("img");
        const label = document.createElement("span");
        const preview = Boolean(articleId && isDraftUuid(articleId));
        figure.append(...(preview ? [image] : []), label, caption);
        // The thumbnail already carries the alt text for screen readers.
        if (preview) label.setAttribute("aria-hidden", "true");
        const update = (current: typeof node) => {
          if (current.type.name !== "image") return false;
          const { assetId, alt, caption: text } = current.attrs;
          if (!isDraftUuid(assetId) || typeof alt !== "string") return false;
          if (preview) {
            image.src = `/api/articles/${articleId}/media/${assetId}`;
            image.alt = alt;
            image.onerror = () => {
              caption.textContent = "Private image preview unavailable.";
            };
          }
          label.textContent = `[Image: ${alt}]`;
          caption.textContent = text || "";
          return true;
        };
        update(node);
        return { dom: figure, update };
      };
    },
  });
}
