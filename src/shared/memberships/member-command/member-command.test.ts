import { expect, it } from "vitest";
import { parseMemberCommand, parseMemberResult } from "./member-command";

const targetUserId = "90000000-0000-0000-0000-000000000005";
const requestId = "80000000-0000-0000-0000-000000000901";
const approve = {
  kind: "approve",
  targetUserId,
  requestId,
  role: "author",
  displayName: "New Member",
  expectedVersion: 1,
} as const;

it("accepts exact membership commands and rejects forged or unsafe fields", () => {
  expect(parseMemberCommand(approve)).toEqual({ ok: true, value: approve });
  for (const input of [
    { ...approve, actorUserId: targetUserId },
    { ...approve, role: "owner" },
    { ...approve, displayName: " New Member " },
    { ...approve, displayName: "Name\nInjected" },
    { ...approve, displayName: "Name\u202eSpoofed" },
    { ...approve, expectedVersion: 0 },
    { ...approve, expectedVersion: null },
    { ...approve, requestId: "bad" },
    {
      kind: "deactivate",
      targetUserId,
      requestId,
      expectedVersion: 1,
      role: "admin",
    },
  ])
    expect(parseMemberCommand(input)).toEqual({
      ok: false,
      code: "invalid_input",
    });
});

it("accepts only a matching safe success or allowlisted failure", () => {
  const success = {
    ok: true,
    targetUserId,
    role: "author",
    active: true,
    version: 1,
    changed: true,
    replayed: false,
  };
  expect(parseMemberResult(success, approve)).toEqual(success);
  expect(parseMemberResult({ ok: false, code: "conflict" }, approve)).toEqual({
    ok: false,
    code: "conflict",
  });
  expect(
    parseMemberResult(
      { ok: false, code: "last_administrator" },
      {
        kind: "deactivate",
        targetUserId,
        requestId,
        expectedVersion: 1,
      },
    ),
  ).toEqual({ ok: false, code: "last_administrator" });
  for (const input of [
    { ...success, targetUserId: requestId },
    { ...success, active: false },
    { ...success, role: "administrator" },
    { ...success, actorUserId: requestId },
    { ok: false, code: "private_sql_error" },
  ])
    expect(parseMemberResult(input, approve)).toEqual({
      ok: false,
      code: "unavailable",
    });
});
