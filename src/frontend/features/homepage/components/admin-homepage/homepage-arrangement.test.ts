import { expect, it } from "vitest";
import {
  addStory,
  choiceKey,
  placeStory,
  removeStory,
  shiftStory,
  type Choices,
  type Story,
} from "./homepage-arrangement";

const s = (n: number): Story => ({
  id: `s${n}`,
  title: `Story ${n}`,
  status: "published",
  imageUrl: null,
});
const empty: Choices = { lead: null, featured: [], readThis: [] };
const ids = (c: Choices) => choiceKey(c);

it("adds once, caps rows at four, replaces the lead", () => {
  let c = addStory(empty, s(1), "featured").choices;
  expect(addStory(c, s(1), "readThis").error).toMatch(/only once/);
  for (const n of [2, 3, 4]) c = addStory(c, s(n), "featured").choices;
  expect(addStory(c, s(5), "featured").error).toMatch(/up to four/);
  const lead = addStory(c, s(5), "lead").choices;
  expect(addStory(lead, s(6), "lead").choices.lead?.id).toBe("s6");
});

it("removes and shifts within a row, stopping at the ends", () => {
  let c: Choices = { ...empty, featured: [s(1), s(2), s(3)] };
  c = shiftStory(c, "featured", 0, 1);
  expect(c.featured.map((x) => x.id)).toEqual(["s2", "s1", "s3"]);
  expect(shiftStory(c, "featured", 0, -1)).toBe(c);
  expect(shiftStory(c, "featured", 2, 1)).toBe(c);
  expect(removeStory(c, "featured", 1).featured.map((x) => x.id)).toEqual([
    "s2",
    "s3",
  ]);
  expect(removeStory({ ...c, lead: s(9) }, "lead", 0).lead).toBeNull();
});

it("drags to reorder inside a row", () => {
  const c: Choices = { ...empty, featured: [s(1), s(2), s(3)] };
  const out = placeStory(
    c,
    s(3),
    { group: "featured", index: 2 },
    { group: "featured", index: 0 },
  );
  expect(out.choices.featured.map((x) => x.id)).toEqual(["s3", "s1", "s2"]);
});

it("drags between rows, refusing a full target", () => {
  const c: Choices = {
    ...empty,
    featured: [s(1), s(2)],
    readThis: [s(3), s(4), s(5), s(6)],
  };
  const full = placeStory(
    c,
    s(1),
    { group: "featured", index: 0 },
    { group: "readThis", index: 0 },
  );
  expect(full.error).toMatch(/up to four/);
  expect(full.choices).toBe(c);
  const ok = placeStory(
    c,
    s(3),
    { group: "readThis", index: 0 },
    { group: "featured", index: 1 },
  );
  expect(ok.choices.featured.map((x) => x.id)).toEqual(["s1", "s3", "s2"]);
  expect(ok.choices.readThis.map((x) => x.id)).toEqual(["s4", "s5", "s6"]);
});

it("swaps the old lead into the dragged story's slot", () => {
  const c: Choices = { lead: s(9), featured: [s(1), s(2)], readThis: [] };
  const out = placeStory(
    c,
    s(2),
    { group: "featured", index: 1 },
    { group: "lead", index: 0 },
  );
  expect(out.choices.lead?.id).toBe("s2");
  expect(out.choices.featured.map((x) => x.id)).toEqual(["s1", "s9"]);
  const none = placeStory(
    { ...c, lead: null },
    s(1),
    { group: "featured", index: 0 },
    { group: "lead", index: 0 },
  );
  expect(none.choices.featured.map((x) => x.id)).toEqual(["s2"]);
});

it("moves the lead into a row and places library stories", () => {
  const c: Choices = { lead: s(9), featured: [s(1)], readThis: [] };
  const out = placeStory(
    c,
    s(9),
    { group: "lead", index: 0 },
    { group: "featured", index: 0 },
  );
  expect(out.choices.lead).toBeNull();
  expect(out.choices.featured.map((x) => x.id)).toEqual(["s9", "s1"]);
  const lib = placeStory(c, s(5), null, { group: "readThis", index: 0 });
  expect(lib.choices.readThis.map((x) => x.id)).toEqual(["s5"]);
  expect(
    placeStory(c, s(1), null, { group: "readThis", index: 0 }).error,
  ).toMatch(/only once/);
  expect(ids(out.choices)).not.toBe(ids(c));
});
