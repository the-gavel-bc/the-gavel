import "server-only";

import type { DraftFailure } from "@/shared/articles/draft-contract/draft-contract";

const retryableSqlStates = new Set(["40001", "40P01", "55P03"]);

export function draftRpcFailure(error: { code: string }): DraftFailure {
  return {
    ok: false,
    code: retryableSqlStates.has(error.code) ? "retryable" : "unavailable",
  };
}
