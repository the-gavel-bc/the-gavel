import { draftJsonbByteLength } from "./draft-json";
import { isValidDraftLink } from "./draft-link";
export { draftJsonbByteLength, isValidDraftLink };

export type DraftMark =
  { type: "bold" | "italic" } | { type: "link"; attrs: { href: string } };
export type DraftInline =
  { type: "text"; text: string; marks?: DraftMark[] } | { type: "hardBreak" };
export type DraftParagraph = { type: "paragraph"; content?: DraftInline[] };
export type DraftBlock =
  | DraftParagraph
  | { type: "heading"; attrs: { level: 2 | 3 }; content?: DraftInline[] }
  | { type: "blockquote"; content: DraftBlock[] }
  | { type: "bulletList"; content: DraftListItem[] }
  | { type: "orderedList"; attrs: { start: number }; content: DraftListItem[] };
export type DraftListItem = {
  type: "listItem";
  content: [DraftParagraph, ...DraftBlock[]];
};
export type DraftDocument = {
  format: "gavel-draft";
  version: 1;
  document: { type: "doc"; content: DraftBlock[] };
};
export type DraftContributor = {
  profileId: string;
  role: "writer" | "editor" | "creative";
  displayOrder: number;
};
export type DraftInput = {
  schemaVersion: 1;
  title: string;
  slug: string;
  sectionId: string;
  excerpt: string | null;
  content: DraftDocument | null;
  seoKeyphrase: string | null;
  metaDescription: string | null;
  categoryIds: string[];
  tagIds: string[];
  contributors: DraftContributor[];
};
export const DRAFT_ERROR_CODES = [
  "invalid_input",
  "unsupported_content",
  "forbidden",
  "not_found",
  "conflict",
  "slug_conflict",
  "request_conflict",
  "rate_limited",
  "unavailable",
] as const;
export type DraftErrorCode = (typeof DRAFT_ERROR_CODES)[number];
export type DraftFailure = {
  ok: false;
  code: DraftErrorCode;
  fieldErrors?: Record<string, string>;
};
export type DraftWriteResult =
  | DraftFailure
  | {
      ok: true;
      articleId: string;
      version: number;
      updatedAt: string;
      replayed: boolean;
      changed: boolean;
    };
export type DraftCheckResult = DraftFailure | { ok: true; value: DraftInput };
export type CreateDraftCommand = { requestId: string; draft: DraftInput };
export type SaveDraftCommand = CreateDraftCommand & {
  articleId: string;
  expectedVersion: number;
};

type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value);
function keys(
  value: JsonObject,
  required: string[],
  optional: string[] = [],
): boolean {
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every(
      (key) => required.includes(key) || optional.includes(key),
    )
  );
}
const integer = (value: unknown, min: number): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= min &&
  value <= 2147483647;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
export const isDraftUuid = (value: unknown): value is string =>
  typeof value === "string" && UUID.test(value);
// Match the existing PostgreSQL scalar trim constraint, not JS trim's different BOM/NEL rules.
const EDGE_SPACE =
  /^[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]|[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]$/u;
function scalar(value: unknown, max: number, nullable = false): boolean {
  return (
    (nullable && value === null) ||
    (typeof value === "string" &&
      Array.from(value).length >= 1 &&
      Array.from(value).length <= max &&
      !EDGE_SPACE.test(value))
  );
}

export function isValidDraftDocument(
  value: unknown,
): value is DraftDocument | null {
  if (value === null) return true;
  const bytes = draftJsonbByteLength(value);
  if (
    bytes === null ||
    bytes > 1048576 ||
    !isObject(value) ||
    !keys(value, ["format", "version", "document"]) ||
    value.format !== "gavel-draft" ||
    value.version !== 1
  )
    return false;
  const stack: {
    node: unknown;
    kind: "root" | "block" | "item" | "inline";
    depth: number;
  }[] = [{ node: value.document, kind: "root", depth: 1 }];
  let nodes = 0;
  while (stack.length) {
    const { node, kind, depth } = stack.pop()!;
    if (++nodes > 5000 || depth > 16 || !isObject(node)) return false;
    const type = node.type;
    if (typeof type !== "string") return false;
    if (
      (kind === "root" && type !== "doc") ||
      (kind === "block" &&
        ![
          "paragraph",
          "heading",
          "blockquote",
          "bulletList",
          "orderedList",
        ].includes(String(type))) ||
      (kind === "item" && type !== "listItem") ||
      (kind === "inline" && type !== "text" && type !== "hardBreak")
    )
      return false;
    if (type === "hardBreak") {
      if (!keys(node, ["type"])) return false;
      continue;
    }
    if (type === "text") {
      if (
        !keys(node, ["type", "text"], ["marks"]) ||
        typeof node.text !== "string" ||
        !node.text.length
      )
        return false;
      if (Object.hasOwn(node, "marks")) {
        if (!Array.isArray(node.marks) || node.marks.length > 3) return false;
        const seen = new Set<string>();
        for (const mark of node.marks) {
          if (
            !isObject(mark) ||
            typeof mark.type !== "string" ||
            seen.has(mark.type)
          )
            return false;
          seen.add(mark.type);
          if (mark.type === "link") {
            if (
              !keys(mark, ["type", "attrs"]) ||
              !isObject(mark.attrs) ||
              !keys(mark.attrs, ["href"]) ||
              !isValidDraftLink(mark.attrs.href)
            )
              return false;
          } else if (
            !["bold", "italic"].includes(mark.type) ||
            !keys(mark, ["type"])
          )
            return false;
        }
      }
      continue;
    }
    const inline = type === "paragraph" || type === "heading";
    const attrs = type === "heading" || type === "orderedList";
    if (
      !keys(
        node,
        inline
          ? attrs
            ? ["type", "attrs"]
            : ["type"]
          : attrs
            ? ["type", "attrs", "content"]
            : ["type", "content"],
        inline ? ["content"] : [],
      )
    )
      return false;
    if (attrs) {
      if (!isObject(node.attrs)) return false;
      if (
        type === "heading"
          ? !keys(node.attrs, ["level"]) ||
            ![2, 3].includes(Number(node.attrs.level)) ||
            typeof node.attrs.level !== "number"
          : !keys(node.attrs, ["start"]) || !integer(node.attrs.start, 1)
      )
        return false;
    }
    if (!Object.hasOwn(node, "content")) continue;
    if (!Array.isArray(node.content) || (!inline && !node.content.length))
      return false;
    if (
      type === "listItem" &&
      (!isObject(node.content[0]) || node.content[0].type !== "paragraph")
    )
      return false;
    if (nodes + stack.length + node.content.length > 5000) return false;
    for (const child of node.content)
      stack.push({
        node: child,
        kind: inline
          ? "inline"
          : type === "bulletList" || type === "orderedList"
            ? "item"
            : "block",
        depth: depth + 1,
      });
  }
  return true;
}

export function checkDraftInput(value: unknown): DraftCheckResult {
  const invalid: DraftFailure = { ok: false, code: "invalid_input" };
  const bytes = draftJsonbByteLength(value);
  if (
    bytes === null ||
    bytes > 1100000 ||
    !isObject(value) ||
    !keys(value, [
      "schemaVersion",
      "title",
      "slug",
      "sectionId",
      "excerpt",
      "content",
      "seoKeyphrase",
      "metaDescription",
      "categoryIds",
      "tagIds",
      "contributors",
    ]) ||
    value.schemaVersion !== 1
  )
    return invalid;
  if (
    !scalar(value.title, 240) ||
    typeof value.slug !== "string" ||
    value.slug.length > 180 ||
    !/^[a-z0-9]+(-[a-z0-9]+)*$/u.test(value.slug) ||
    !isDraftUuid(value.sectionId) ||
    !scalar(value.excerpt, 600, true) ||
    !scalar(value.seoKeyphrase, 160, true) ||
    !scalar(value.metaDescription, 320, true)
  )
    return invalid;
  const sortedIds: string[][] = [];
  for (const [field, cap] of [
    ["categoryIds", 32],
    ["tagIds", 64],
  ] as const) {
    const ids = value[field];
    if (!Array.isArray(ids) || ids.length > cap || !ids.every(isDraftUuid))
      return invalid;
    const canonical = ids.map((id) => id.toLowerCase());
    if (new Set(canonical).size !== ids.length) return invalid;
    sortedIds.push(canonical.sort());
  }
  if (!Array.isArray(value.contributors) || value.contributors.length > 32)
    return invalid;
  const contributors: DraftContributor[] = [];
  const pairs = new Set<string>();
  for (const credit of value.contributors) {
    if (
      !isObject(credit) ||
      !keys(credit, ["profileId", "role", "displayOrder"]) ||
      !isDraftUuid(credit.profileId) ||
      typeof credit.role !== "string" ||
      !["writer", "editor", "creative"].includes(credit.role) ||
      !integer(credit.displayOrder, 0)
    )
      return invalid;
    const profileId = credit.profileId.toLowerCase();
    const pair = profileId + ":" + credit.role;
    if (pairs.has(pair)) return invalid;
    pairs.add(pair);
    contributors.push({
      profileId,
      role: credit.role as DraftContributor["role"],
      displayOrder: credit.displayOrder,
    });
  }
  if (
    value.content !== null &&
    isObject(value.content) &&
    (value.content.format !== "gavel-draft" || value.content.version !== 1)
  )
    return { ok: false, code: "unsupported_content" };
  if (!isValidDraftDocument(value.content)) return invalid;
  contributors.sort((a, b) =>
    a.profileId < b.profileId
      ? -1
      : a.profileId > b.profileId
        ? 1
        : a.role < b.role
          ? -1
          : a.role > b.role
            ? 1
            : 0,
  );
  return {
    ok: true,
    value: {
      schemaVersion: 1,
      title: value.title as string,
      slug: value.slug,
      sectionId: value.sectionId.toLowerCase(),
      excerpt: value.excerpt as string | null,
      content: value.content,
      seoKeyphrase: value.seoKeyphrase as string | null,
      metaDescription: value.metaDescription as string | null,
      categoryIds: sortedIds[0],
      tagIds: sortedIds[1],
      contributors,
    },
  };
}
