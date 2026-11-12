import { expect, it, vi } from "vitest";

it("validates contributor search and creation without Function under strict CSP", async () => {
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
  let configured: boolean | undefined;
  let search: unknown;
  let created: unknown;
  let invalid: boolean | undefined;
  const choice = {
    id: "81000000-0000-0000-0000-000000000001",
    displayName: "Guest",
    slug: "guest",
  };
  const result = { ...choice, ok: true, created: true, replayed: false };
  try {
    const schemas = await import("./guest-contributor");
    search = schemas.contributorSearchResultSchema.parse({
      ok: true,
      items: [choice],
    });
    created = schemas.guestContributorResultSchema.parse(result);
    invalid = schemas.guestContributorCommandSchema.safeParse({
      requestId: choice.id,
      displayName: " ",
    }).success;
    configured = z.config().jitless;
  } finally {
    vi.unstubAllGlobals();
    z.config({ jitless: previous });
  }
  expect(attempts).toBe(0);
  expect(configured).toBe(true);
  expect(search).toEqual({ ok: true, items: [choice] });
  expect(created).toEqual(result);
  expect(invalid).toBe(false);
});
