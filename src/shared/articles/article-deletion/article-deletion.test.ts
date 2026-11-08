import { describe, expect, it } from "vitest";
import { deletionCommandSchema, parseDeletionResult } from "./article-deletion";
const id = "84000000-0000-4000-8000-000000000002";
const command = {
  articleId: id,
  expectedVersion: 1,
  requestId: "84000000-0000-4000-8000-000000000003",
  confirm: true,
};
describe("article deletion contract", () => {
  it("requires explicit confirmation and rejects unexpected fields", () => {
    expect(deletionCommandSchema.safeParse(command).success).toBe(true);
    expect(
      deletionCommandSchema.safeParse({ ...command, confirm: false }).success,
    ).toBe(false);
    expect(
      deletionCommandSchema.safeParse({ ...command, articleId: "bad" }).success,
    ).toBe(false);
    expect(
      deletionCommandSchema.safeParse({ ...command, ownerId: id }).success,
    ).toBe(false);
  });
  it("preserves safe failures and rejects a result for another article", () => {
    expect(
      parseDeletionResult({ ok: false, code: "media_cleanup_required" }, id),
    ).toEqual({ ok: false, code: "media_cleanup_required" });
    expect(
      parseDeletionResult(
        { ok: true, articleId: command.requestId, replayed: false },
        id,
      ),
    ).toEqual({ ok: false, code: "unavailable" });
  });
});
