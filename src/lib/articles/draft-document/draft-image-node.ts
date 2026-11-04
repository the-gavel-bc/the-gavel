import { Node } from "@tiptap/core";
import { isDraftUuid } from "../draft-contract/draft-contract";

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
        const figure = document.createElement("figure");
        const caption = document.createElement("figcaption");
        const image = document.createElement("img");
        const label = document.createElement("span");
        const preview = Boolean(articleId && isDraftUuid(articleId));
        figure.append(preview ? image : label, caption);
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
          } else label.textContent = `Image: ${alt}`;
          caption.textContent = text || "";
          return true;
        };
        update(node);
        return { dom: figure, update };
      };
    },
  });
}
