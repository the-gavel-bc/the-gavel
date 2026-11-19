// Pure arrangement rules for the homepage curation page: one lead plus two
// rows of up to four stories, each story once. Every function returns the new
// arrangement, or an `error` message when the move is refused.
export type Story = {
  id: string;
  title: string;
  status: "draft" | "published" | "archived";
  imageUrl: string | null;
};
export type Group = "lead" | "featured" | "readThis";
export type RowGroup = Exclude<Group, "lead">;
export type Choices = {
  lead: Story | null;
  featured: Story[];
  readThis: Story[];
};
export type Place = { group: Group; index: number };
export type Outcome = { choices: Choices; error?: string };

export const ROW_LIMIT = 4;
export const groupLabel: Record<Group, string> = {
  lead: "Lead story",
  featured: "Featured News",
  readThis: "Read This",
};

export const choiceKey = (value: Choices) =>
  JSON.stringify([
    value.lead?.id ?? null,
    value.featured.map((item) => item.id),
    value.readThis.map((item) => item.id),
  ]);
export const selectedStories = (value: Choices) => [
  ...(value.lead ? [value.lead] : []),
  ...value.featured,
  ...value.readThis,
];

const refuse = (choices: Choices, error: string): Outcome => ({
  choices,
  error,
});
const row = (choices: Choices, group: RowGroup) => choices[group];

export function addStory(
  choices: Choices,
  story: Story,
  group: Group,
): Outcome {
  if (selectedStories(choices).some((item) => item.id === story.id))
    return refuse(choices, "A story can appear only once.");
  if (group === "lead") return { choices: { ...choices, lead: story } };
  if (row(choices, group).length >= ROW_LIMIT)
    return refuse(choices, "Each row holds up to four stories.");
  return { choices: { ...choices, [group]: [...row(choices, group), story] } };
}

export function removeStory(
  choices: Choices,
  group: Group,
  index: number,
): Choices {
  if (group === "lead") return { ...choices, lead: null };
  return {
    ...choices,
    [group]: row(choices, group).filter((_, i) => i !== index),
  };
}

export function shiftStory(
  choices: Choices,
  group: RowGroup,
  index: number,
  offset: -1 | 1,
): Choices {
  const items = [...row(choices, group)];
  const target = index + offset;
  if (target < 0 || target >= items.length) return choices;
  [items[index], items[target]] = [items[target], items[index]];
  return { ...choices, [group]: items };
}

// Drag and drop: `from` is where the story sits now (null when it comes from
// the library); `to` is the slot it is dropped on.
export function placeStory(
  choices: Choices,
  story: Story,
  from: Place | null,
  to: Place,
): Outcome {
  if (!from) return addStoryAt(choices, story, to);
  if (from.group === to.group && from.group === "lead") return { choices };
  if (to.group === "lead") {
    // The dropped story becomes the lead; the old lead takes its old slot.
    const previous = choices.lead;
    let next = removeStory(choices, from.group, from.index);
    if (previous && from.group !== "lead") {
      const items = [...row(next, from.group as RowGroup)];
      items.splice(Math.min(from.index, items.length), 0, previous);
      next = { ...next, [from.group]: items };
    }
    return { choices: { ...next, lead: story } };
  }
  const target = to.group;
  if (from.group === target) {
    const items = [...row(choices, target)];
    const [moved] = items.splice(from.index, 1);
    items.splice(Math.min(to.index, items.length), 0, moved);
    return { choices: { ...choices, [target]: items } };
  }
  if (row(choices, target).length >= ROW_LIMIT)
    return refuse(choices, "Each row holds up to four stories.");
  const without = removeStory(choices, from.group, from.index);
  const items = [...row(without, target)];
  items.splice(Math.min(to.index, items.length), 0, story);
  return { choices: { ...without, [target]: items } };
}

function addStoryAt(choices: Choices, story: Story, to: Place): Outcome {
  if (selectedStories(choices).some((item) => item.id === story.id))
    return refuse(choices, "A story can appear only once.");
  if (to.group === "lead") return { choices: { ...choices, lead: story } };
  if (row(choices, to.group).length >= ROW_LIMIT)
    return refuse(choices, "Each row holds up to four stories.");
  const items = [...row(choices, to.group)];
  items.splice(Math.min(to.index, items.length), 0, story);
  return { choices: { ...choices, [to.group]: items } };
}
