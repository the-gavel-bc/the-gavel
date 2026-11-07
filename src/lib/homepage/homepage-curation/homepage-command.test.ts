import { expect, it } from "vitest";
import { homepageCommandSchema, parseHomepageResult } from "./homepage-command";
const id = (n: number) =>
  `83000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const command = {
  requestId: id(1),
  expectedVersion: 1,
  lead: id(2),
  featured: [id(3)],
  readThis: [id(4)],
};
it("rejects duplicates, oversized groups and privileged fields", () => {
  for (const value of [
    { ...command, featured: [id(2)] },
    { ...command, readThis: [id(3)] },
    { ...command, featured: [id(3), id(4), id(5), id(6), id(7)] },
    { ...command, actorId: id(1) },
  ])
    expect(homepageCommandSchema.safeParse(value).success).toBe(false);
  expect(homepageCommandSchema.safeParse(command).success).toBe(true);
});
it("validates safe results", () => {
  expect(
    parseHomepageResult({
      ok: true,
      version: 2,
      changed: true,
      replayed: false,
    }),
  ).toEqual({ ok: true, version: 2, changed: true, replayed: false });
  expect(parseHomepageResult({ ok: true, version: 0 })).toEqual({
    ok: false,
    code: "unavailable",
  });
});
