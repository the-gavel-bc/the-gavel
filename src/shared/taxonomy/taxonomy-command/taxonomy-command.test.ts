import { expect, it } from "vitest";
import { parseTaxonomyCommand, parseTaxonomyResult } from "./taxonomy-command";

const command = {
  kind: "section",
  id: "81000000-0000-0000-0000-000000000001",
  requestId: "81000000-0000-0000-0000-000000000002",
  expectedVersion: 1,
  name: "News",
  navigationOrder: 0,
  active: true,
} as const;
it("rejects slug, parent, actor and invalid order fields", () => {
  for (const value of [
    { ...command, slug: "news" },
    { ...command, parentId: command.id },
    { ...command, actorId: command.id },
    { ...command, navigationOrder: -1 },
  ])
    expect(parseTaxonomyCommand(value)).toEqual({
      ok: false,
      code: "invalid_input",
    });
});
it("validates result identity and state", () => {
  const result = {
    ok: true,
    kind: "section",
    id: command.id,
    version: 2,
    active: true,
    changed: true,
    replayed: false,
  };
  expect(parseTaxonomyResult(result, command)).toEqual(result);
  expect(
    parseTaxonomyResult({ ...result, id: command.requestId }, command),
  ).toEqual({ ok: false, code: "unavailable" });
});
