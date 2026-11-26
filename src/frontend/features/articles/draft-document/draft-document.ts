import type { JSONContent } from "@tiptap/core";
import {
  draftJsonbByteLength,
  isValidDraftDocument,
  type DraftDocument,
  type DraftFailure,
} from "../../../../shared/articles/draft-contract/draft-contract";
export const DRAFT_LINK_ATTRIBUTES = {
  target: "_blank",
  rel: "noopener noreferrer nofollow",
  class: null,
  title: null,
} as const;
export type EditorDocumentResult =
  { ok: true; document: JSONContent } | DraftFailure;
export type DraftDocumentResult =
  { ok: true; document: DraftDocument } | DraftFailure;
// Tiptap adds fixed attributes that the stored document omits. Native=true adds
// those defaults; the reverse accepts only known defaults and rejects other values
// instead of silently discarding unsupported author content.
function translate(value: unknown, native: boolean): JSONContent {
  const copy = JSON.parse(JSON.stringify(value)) as JSONContent;
  const visit = (node: JSONContent) => {
    if (
      Object.hasOwn(node, "attrs") &&
      (node.attrs === null ||
        typeof node.attrs !== "object" ||
        Array.isArray(node.attrs))
    )
      throw new Error("Unsupported attribute shape.");
    if (node.type === "link" && node.attrs) {
      const attrs = node.attrs;
      if (!native) {
        for (const [key, value] of Object.entries(attrs)) {
          if (
            key !== "href" &&
            (!Object.hasOwn(DRAFT_LINK_ATTRIBUTES, key) ||
              DRAFT_LINK_ATTRIBUTES[
                key as keyof typeof DRAFT_LINK_ATTRIBUTES
              ] !== value)
          )
            throw new Error("Unsupported link attributes.");
        }
      }
      node.attrs = native
        ? { ...DRAFT_LINK_ATTRIBUTES, href: attrs.href }
        : { href: attrs.href };
    } else if (node.type === "orderedList" && node.attrs) {
      if (
        !native &&
        (Object.keys(node.attrs).some(
          (key) => key !== "start" && key !== "type",
        ) ||
          (Object.hasOwn(node.attrs, "type") && node.attrs.type !== null))
      )
        throw new Error("Unsupported list attributes.");
      node.attrs = native
        ? { start: node.attrs.start, type: null }
        : { start: node.attrs.start };
    } else if (node.type === "image" && node.attrs && !native) {
      // Credit and file name are optional: an unset value is left out so
      // articles saved before these fields existed round-trip unchanged.
      for (const key of ["credit", "name"])
        if (node.attrs[key] === null) delete node.attrs[key];
    } else if (node.attrs && Object.keys(node.attrs).length === 0)
      delete node.attrs;
    node.content?.forEach(visit);
    node.marks?.forEach(visit);
  };
  visit(copy);
  return copy;
}
export function toEditorDocument(
  content: DraftDocument | null,
): EditorDocumentResult {
  if (!isValidDraftDocument(content))
    return { ok: false, code: "unsupported_content" };
  if (content === null)
    return {
      ok: true,
      document: { type: "doc", content: [{ type: "paragraph" }] },
    };
  return { ok: true, document: translate(content.document, true) };
}
export function fromEditorDocument(value: unknown): DraftDocumentResult {
  const bytes = draftJsonbByteLength(value, 2 * 1024 * 1024);
  // Native fixed attributes add overhead; the canonical body still has its separate 1 MiB cap.
  if (bytes === null || bytes > 2 * 1024 * 1024)
    return { ok: false, code: "invalid_input" };
  try {
    const document = translate(value, false);
    const stack: JSONContent[] = [document];
    let hasImage = false;
    while (stack.length) {
      const node = stack.pop()!;
      if (node.type === "image") hasImage = true;
      if (node.content) stack.push(...node.content);
    }
    const envelope: unknown = {
      format: "gavel-draft",
      version: hasImage ? 2 : 1,
      document,
    };
    return isValidDraftDocument(envelope) && envelope !== null
      ? { ok: true, document: envelope }
      : { ok: false, code: "unsupported_content" };
  } catch {
    return { ok: false, code: "unsupported_content" };
  }
}
