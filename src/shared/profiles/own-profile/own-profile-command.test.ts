import { expect, it } from "vitest";
import {
  ownProfileCommandSchema,
  parseOwnProfileResult,
} from "./own-profile-command";
const id = "82000000-0000-0000-0000-000000000001";
const command = {
  requestId: id,
  expectedVersion: 1,
  displayName: "Writer",
  biography: null,
};
it("rejects caller-selected profile, slug, role, and malformed text", () => {
  for (const value of [
    { ...command, profileId: id },
    { ...command, slug: "chosen" },
    { ...command, role: "administrator" },
    { ...command, biography: "bad\u0000text" },
    { ...command, displayName: " Writer " },
  ])
    expect(ownProfileCommandSchema.safeParse(value).success).toBe(false);
});
it("requires a result for the verified profile", () => {
  const result = {
    ok: true,
    profileId: id,
    slug: "writer",
    version: 2,
    changed: true,
    replayed: false,
  };
  expect(parseOwnProfileResult(result, id)).toEqual(result);
  expect(
    parseOwnProfileResult(result, "82000000-0000-0000-0000-000000000002"),
  ).toEqual({ ok: false, code: "unavailable" });
});
