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
export function DraftSnapshot({
  input,
  options,
}: {
  input: DraftInput;
  options: DraftOptions;
}) {
  const name = (id: string, choices: { id: string; name: string }[]) =>
    choices.find((c) => c.id === id)?.name ?? `Unavailable selection: ${id}`;
  return (
    <div className={styles.snapshot}>
      <dl>
        {[
          ["Title", input.title],
          ["Section", name(input.sectionId, options.sections)],
          ["Excerpt", input.excerpt],
          ["SEO keyphrase", input.seoKeyphrase],
          ["Meta description", input.metaDescription],
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
          .map((id) => name(id, options.categories))
          .join(", ") || "None"}
      </p>
      <p>
        Tags:{" "}
        {input.tagIds.map((id) => name(id, options.tags)).join(", ") || "None"}
      </p>
      <p>
        Contributors:{" "}
        {input.contributors
          .map(
            (c) =>
              `${options.contributors.find((p) => p.id === c.profileId)?.displayName ?? `Unavailable contributor: ${c.profileId}`} (${c.role}, order ${c.displayOrder})`,
          )
          .join(", ") || "None"}
      </p>
      <p>Body preview (plain text; formatting remains in the saved draft):</p>
      <pre>{input.content ? text(input.content.document) : "Empty body"}</pre>
    </div>
  );
}
