import { expect, it, vi } from "vitest";

it("loads and uses typed-tag schemas without probing Function under strict CSP", async () => {
  vi.resetModules();
  const { z } = await import("zod");
  const previous = z.config().jitless;
  z.config({ jitless: false });
  let attempts = 0;
  const denyEval = () => {
    attempts += 1;
    throw new EvalError("Code generation blocked by CSP");
  };
  vi.stubGlobal(
    "Function",
    new Proxy(globalThis.Function, {
      apply: denyEval,
      construct: denyEval,
    }),
  );
  let parsed: unknown;
  let invalid: boolean | undefined;
  let normalized: string | undefined;
  let configured: boolean | undefined;
  const row = {
    ok: true,
    id: "81000000-0000-0000-0000-000000000001",
    name: "Campus news",
    slug: "campus-news",
    created: true,
  };
  try {
    const schemas = await import("@/shared/taxonomy/ensure-tag/ensure-tag");
    parsed = schemas.ensureTagResultSchema.parse(row);
    invalid = schemas.ensureTagResultSchema.safeParse({
      ...row,
      id: "invalid",
    }).success;
    normalized = schemas.tagNameSchema.parse("  Campus\tnews ");
    configured = z.config().jitless;
  } finally {
    vi.unstubAllGlobals();
    z.config({ jitless: previous });
  }
  expect(attempts).toBe(0);
  expect(configured).toBe(true);
  expect(parsed).toEqual(row);
  expect(invalid).toBe(false);
  expect(normalized).toBe("Campus news");
});
