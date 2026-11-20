import type {
  DraftBlock,
  DraftInline,
  DraftListItem,
  DraftInput,
  DraftDocument,
} from "@/shared/articles/draft-contract/draft-contract";
import type { DraftOptions } from "@/backend/articles/draft-options/draft-options";
import styles from "./draft-conflict-panel.module.css";
function text(
  node: DraftDocument["document"] | DraftBlock | DraftInline | DraftListItem,
): string {
  if ("text" in node) return node.text;
  if (node.type === "hardBreak") return "\n";
  return "content" in node
    ? (node.content
        ?.map(text)
        .join(
          node.type === "paragraph" || node.type === "heading" ? "" : "\n",
        ) ?? "")
    : "";
}
// Assign the same display numbers on either side without revealing database IDs.
function unavailable(kind: string, id: string, ids: string[]) {
  const position = [...new Set(ids)].sort().indexOf(id) + 1;
  return `Unavailable ${kind} ${position}`;
}

export function DraftSnapshot({
  input,
  options,
  comparison,
}: {
  input: DraftInput;
  options: DraftOptions;
  comparison?: DraftInput;
}) {
  const categoryIds = [
    ...input.categoryIds,
    ...(comparison?.categoryIds ?? []),
  ];
  const tagIds = [...input.tagIds, ...(comparison?.tagIds ?? [])];
  const creditIds = [
    ...input.contributors,
    ...(comparison?.contributors ?? []),
  ].map((credit) => credit.profileId);
  return (
    <div className={styles.snapshot}>
      <dl>
        {[
          ["Title", input.title],
          [
            "Section",
            options.sections.find(({ id }) => id === input.sectionId)?.name ??
              unavailable("section", input.sectionId, [
                input.sectionId,
                comparison?.sectionId ?? input.sectionId,
              ]),
          ],
          ["Excerpt", input.excerpt],
          ["SEO keyphrase", input.seoKeyphrase],
          ["Meta description", input.metaDescription],
          ["Publication date", input.publicationDate ?? "Day it is published"],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value ?? "Empty"}</dd>
          </div>
        ))}
      </dl>
      <p>
        Categories:{" "}
        {input.categoryIds
          .map(
            (id) =>
              options.categories.find((category) => category.id === id)?.name ??
              unavailable("category", id, categoryIds),
          )
          .join(", ") || "None"}
      </p>
      <p>
        Tags:{" "}
        {input.tagIds
          .map(
            (id) =>
              options.tags.find((tag) => tag.id === id)?.name ??
              unavailable("tag", id, tagIds),
          )
          .join(", ") || "None"}
      </p>
      <p>
        Contributors:{" "}
        {input.contributors
          .map(
            (c) =>
              `${options.contributors.find((p) => p.id === c.profileId)?.displayName ?? unavailable("contributor", c.profileId, creditIds)} (${c.role}, order ${c.displayOrder})`,
          )
          .join(", ") || "None"}
      </p>
      <p>Body preview (plain text; formatting remains in the saved draft):</p>
      <pre>{input.content ? text(input.content.document) : "Empty body"}</pre>
    </div>
  );
}
