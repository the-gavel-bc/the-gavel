import { describe, expect, it } from "vitest";
import {
  parseArticleLifecycleCommand,
  parseArticleLifecycleResult,
} from "./article-lifecycle";

const id = "00000000-0000-0000-0000-000000000123";
const requestId = "00000000-0000-0000-0000-000000000456";
describe("article lifecycle contract", () => {
  it("accepts only strict versioned commands", () => {
    expect(
      parseArticleLifecycleCommand({
        articleId: id,
        requestId,
        expectedVersion: 1,
      }),
    ).toEqual({
      ok: true,
      value: { articleId: id, requestId, expectedVersion: 1 },
    });
    for (const bad of [
      { articleId: id, requestId, expectedVersion: 0 },
      { articleId: id, requestId, expectedVersion: 1, status: "published" },
      { articleId: id, requestId: "bad", expectedVersion: 1 },
    ])
      expect(parseArticleLifecycleCommand(bad)).toEqual({
        ok: false,
        code: "invalid_input",
      });
  });
  it("rejects malformed or mismatched success responses", () => {
    const success = {
      ok: true,
      articleId: id,
      status: "published",
      version: 2,
      updatedAt: "2026-11-04T12:00:00Z",
      replayed: false,
      changed: true,
    };
    expect(parseArticleLifecycleResult(success, "published", id)).toEqual(
      success,
    );
    expect(
      parseArticleLifecycleResult(
        {
          ok: false,
          code: "invalid_input",
          fieldErrors: { title: "Required" },
        },
        "published",
        id,
      ),
    ).toEqual({
      ok: false,
      code: "invalid_input",
      fieldErrors: { title: "Required" },
    });
    expect(parseArticleLifecycleResult(success, "archived", id)).toEqual({
      ok: false,
      code: "unavailable",
    });
    expect(
      parseArticleLifecycleResult(
        { ...success, articleId: requestId },
        "published",
        id,
      ),
    ).toEqual({ ok: false, code: "unavailable" });
    expect(
      parseArticleLifecycleResult(
        { ...success, version: "2" },
        "published",
        id,
      ),
    ).toEqual({ ok: false, code: "unavailable" });
  });
});
