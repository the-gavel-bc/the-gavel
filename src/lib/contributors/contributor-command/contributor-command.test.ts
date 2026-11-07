import { expect, it } from "vitest";
import {
  parseContributorCommand,
  parseContributorResult,
} from "./contributor-command";

const requestId = "80000000-0000-0000-0000-000000000901";
const profileId = "90000000-0000-0000-0000-000000000901";
const command = {
  kind: "save",
  profileId,
  expectedVersion: 1,
  requestId,
  displayName: "Guest Writer",
  biography: "Plain text",
} as const;
it("rejects privileged fields, stale shapes and invalid biography", () => {
  for (const input of [
    { ...command, slug: "chosen" },
    { ...command, auth_user_id: profileId },
    { ...command, expectedVersion: 0 },
    { ...command, biography: "bad\u0000bio" },
  ])
    expect(parseContributorCommand(input)).toEqual({
      ok: false,
      code: "invalid_input",
    });
});
it("accepts plain text and validates the database result", () => {
  expect(parseContributorCommand(command).ok).toBe(true);
  const result = {
    ok: true,
    profileId,
    slug: "guest-writer",
    version: 2,
    active: true,
    changed: true,
    replayed: false,
  };
  expect(parseContributorResult(result, command)).toEqual(result);
  expect(
    parseContributorResult({ ...result, profileId: requestId }, command),
  ).toEqual({ ok: false, code: "unavailable" });
});
