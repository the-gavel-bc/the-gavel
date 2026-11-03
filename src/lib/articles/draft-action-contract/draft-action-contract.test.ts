import { expect, it } from "vitest";
import {
  parseCreateCommand,
  parseSaveCommand,
  parseDraftWriteResult,
} from "./draft-action-contract";
import { baseDraft } from "../draft-contract/draft-test-cases";
import { articleId, updatedAt } from "../draft-queries/draft-query-test-client";
const create = { requestId: articleId, draft: baseDraft };
it("accepts only complete commands and canonicalizes the draft", () => {
  expect(parseCreateCommand(create)).toEqual({ ok: true, value: create });
  expect(
    parseSaveCommand({ ...create, articleId, expectedVersion: 1 }),
  ).toMatchObject({ ok: true });
});
it.each([
  null,
  { ...create, actorId: articleId },
  { ...create, status: "published" },
  { ...create, requestId: "invalid" },
  { ...create, draft: { ...baseDraft, ownerProfileId: articleId } },
  { ...create, draft: { ...baseDraft, slug: "chosen-path" } },
])("rejects forged create commands", (value) => {
  expect(parseCreateCommand(value)).toEqual({
    ok: false,
    code: "invalid_input",
  });
});
it.each([0, -1, 1.5, 2147483648, undefined])(
  "rejects invalid expected version %s",
  (expectedVersion) => {
    expect(parseSaveCommand({ ...create, articleId, expectedVersion })).toEqual(
      { ok: false, code: "invalid_input" },
    );
  },
);
it("retains the unsupported-content classification", () => {
  expect(
    parseCreateCommand({
      ...create,
      draft: { ...baseDraft, content: { format: "legacy" } },
    }),
  ).toEqual({ ok: false, code: "unsupported_content" });
});
const success = {
  ok: true,
  articleId,
  version: 2,
  updatedAt,
  replayed: true,
  changed: false,
};
it("preserves confirmed replay and no-op receipts", () => {
  expect(parseDraftWriteResult(success)).toEqual(success);
  expect(parseDraftWriteResult({ ok: false, code: "conflict" })).toEqual({
    ok: false,
    code: "conflict",
  });
});
it.each([
  null,
  { ...success, version: 0 },
  { ...success, updatedAt: "bad" },
  { ...success, body: "private" },
  { ok: false, code: "SQLSTATE" },
  { ok: false, code: "invalid_input", details: "raw SQL" },
  { ok: false, code: "invalid_input", fieldErrors: { password: "secret" } },
])("masks malformed RPC responses", (value) => {
  expect(parseDraftWriteResult(value)).toEqual({
    ok: false,
    code: "unavailable",
  });
});
