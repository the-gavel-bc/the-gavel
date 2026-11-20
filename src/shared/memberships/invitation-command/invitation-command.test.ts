import { expect, it } from "vitest";
import {
  parseInviteText,
  parseInvitationCommand,
  parseInvitationResult,
} from "./invitation-command";

it("parses both Name <email> and email, Name lines without dropping names", () => {
  expect(
    parseInviteText(
      "First Person <first@bc.edu>\nsecond@bc.edu, Second Person",
    ),
  ).toEqual({
    entries: [
      { email: "first@bc.edu", displayName: "First Person" },
      { email: "second@bc.edu", displayName: "Second Person" },
    ],
    invalid: [],
  });
  expect(parseInviteText("Spoof\u202e <bad@bc.edu>").invalid).toContain(
    "Spoof\u202e <bad@bc.edu>",
  );
  expect(
    parseInviteText("First <a@bc.edu>, Second <b@bc.edu>").entries,
  ).toEqual([
    { email: "a@bc.edu", displayName: "First" },
    { email: "b@bc.edu", displayName: "Second" },
  ]);
});

const inviteId = "80000000-0000-0000-0000-000000000901";
const invitationId = "90000000-0000-0000-0000-000000000901";
const change = {
  kind: "changeRole",
  requestId: inviteId,
  invitationId,
  expectedVersion: 4,
  role: "administrator",
} as const;

it("requires a current positive invitation version and strict command fields", () => {
  expect(parseInvitationCommand(change)).toEqual({ ok: true, value: change });
  for (const input of [
    { ...change, expectedVersion: 3.5 },
    { ...change, expectedVersion: 0 },
    { ...change, expectedVersion: 2147483648 },
    { ...change, actorId: invitationId },
    { ...change, invitationId: "bad" },
  ])
    expect(parseInvitationCommand(input)).toEqual({
      ok: false,
      code: "invalid_input",
    });
});

it("rejects invisible Unicode format characters in invitation names", () => {
  expect(
    parseInvitationCommand({
      kind: "invite",
      requestId: inviteId,
      entries: [
        {
          email: "spoof@bc.edu",
          role: "author",
          displayName: "Name\u202eSpoof",
        },
      ],
    }),
  ).toEqual({ ok: false, code: "invalid_input" });
});

it("accepts only safe action results matching the command", () => {
  expect(
    parseInvitationResult(
      {
        ok: true,
        invitationId,
        role: "administrator",
        version: 5,
        replayed: true,
      },
      change,
    ),
  ).toEqual({ ok: true, changed: true });
  for (const value of [
    { ok: true, added: 1, updated: 0, skipped: [], replayed: false },
    { ok: true, invitationId, role: "owner", version: 5, replayed: false },
    { ok: false, code: "private_sql_error" },
  ])
    expect(parseInvitationResult(value, change)).toEqual({
      ok: false,
      code: "unavailable",
    });
  for (const value of [
    {
      ok: true,
      invitationId: "90000000-0000-0000-0000-000000000902",
      role: "administrator",
      version: 5,
      replayed: false,
    },
    { ok: true, invitationId, role: "author", version: 5, replayed: false },
    {
      ok: true,
      invitationId,
      role: "administrator",
      version: 4,
      replayed: false,
    },
  ])
    expect(parseInvitationResult(value, change)).toEqual({
      ok: false,
      code: "unavailable",
    });
});
