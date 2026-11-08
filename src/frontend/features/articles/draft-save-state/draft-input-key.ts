import type { DraftInput } from "../../../../shared/articles/draft-contract/draft-contract";
// Association order and JSON object-key order have no stored meaning; body arrays do.
export function draftInputKey(input: DraftInput): string {
  const sorted = {
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
  return JSON.stringify(sorted, (_, value: unknown) =>
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
        )
      : value,
  );
}
