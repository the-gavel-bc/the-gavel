import { expect, it } from "vitest";
import {
  parseInvitationCommand,
  parseInvitationResult,
} from "./invitation-command";

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
});
