import type { DraftInput } from "../../../../shared/articles/draft-contract/draft-contract";
import type { DraftOptions } from "../../../../backend/articles/draft-options/draft-options";
/** One article credits at most this many people. */
export const MAX_CONTRIBUTORS = 5;
export function draftSelectionErrors(
  draft: DraftInput,
  options: DraftOptions,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const includes = (choices: { id: string }[], id: string) =>
    choices.some((choice) => choice.id.toLowerCase() === id.toLowerCase());
  if (!includes(options.sections, draft.sectionId))
    errors.sectionId = "Choose an active section.";
  for (const [field, choices, cap] of [
    [
      "categoryIds",
      options.categories.filter((c) => c.sectionId === draft.sectionId),
      32,
    ],
    ["tagIds", options.tags, 64],
  ] as const) {
    const ids = draft[field];
    if (
      ids.length > cap ||
      new Set(ids.map((id) => id.toLowerCase())).size !== ids.length ||
      ids.some((id) => !includes(choices, id))
    )
      errors[field] =
        `Choose up to ${cap} distinct available ${field === "categoryIds" ? "categories in this section" : "tags"}; remove or replace unavailable selections.`;
  }
  const pairs = draft.contributors.map(
    (c) => `${c.profileId.toLowerCase()}:${c.role}`,
  );
  if (
    draft.contributors.length > MAX_CONTRIBUTORS ||
    new Set(pairs).size !== pairs.length ||
    draft.contributors.some(
      (c) =>
        !includes(options.contributors, c.profileId) ||
        !["writer", "editor", "creative"].includes(c.role) ||
        !Number.isInteger(c.displayOrder) ||
        c.displayOrder < 0 ||
        c.displayOrder > 2147483647,
    )
  )
    errors.contributors = `Choose up to ${MAX_CONTRIBUTORS} available contributors, each with a different role for the same person.`;
  return errors;
}
