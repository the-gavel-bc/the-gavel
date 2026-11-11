import type { DraftInput } from "../../../../shared/articles/draft-contract/draft-contract";
const canonicalJson = (value: unknown): string =>
  JSON.stringify(value, (_, item: unknown) =>
    item !== null && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
export function draftContentKey(content: DraftInput["content"]): string {
  return canonicalJson(content);
}
// Association order and JSON object-key order have no stored meaning; body arrays do.
export function draftInputKey(input: DraftInput): string {
  // General callers can mutate their input between calls; never cache by reference here.
  return canonicalJson(normalizeDraftInput(input));
}
function normalizeDraftInput(input: DraftInput) {
  return {
    ...input,
    sectionId: input.sectionId.toLowerCase(),
    categoryIds: input.categoryIds.map((id) => id.toLowerCase()).sort(),
    tagIds: input.tagIds.map((id) => id.toLowerCase()).sort(),
    contributors: input.contributors
      .map((c) => ({ ...c, profileId: c.profileId.toLowerCase() }))
      .sort((a, b) =>
        `${a.profileId}:${a.role}`.localeCompare(`${b.profileId}:${b.role}`),
      ),
  };
}
// Only the form-owned immutable body may reuse a previously computed content key.
export function draftInputKeyWithContentKey(
  input: DraftInput,
  contentKey: string,
): string {
  return `{${Object.entries(normalizeDraftInput(input))
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([, value]) => value !== undefined)
    .map(
      ([name, value]) =>
        `${JSON.stringify(name)}:${name === "content" ? contentKey : canonicalJson(value)}`,
    )
    .join(",")}}`;
}
