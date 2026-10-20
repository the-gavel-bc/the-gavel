import { describe, expect, it } from "vitest";
import { getServerEnv } from "./server";

const validServerEnv = {
  NODE_ENV: "test" as const,
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_test_key",
  SITE_URL: "http://localhost:3000",
};

describe("getServerEnv", () => {
  it("returns an immutable validated server configuration", () => {
    const result = getServerEnv(validServerEnv);

    expect(result).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: validServerEnv.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        validServerEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      SITE_URL: validServerEnv.SITE_URL,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("reports a missing variable by name without exposing configured values", () => {
    expect(() =>
      getServerEnv({
        ...validServerEnv,
        SITE_URL: undefined,
      }),
    ).toThrowError(/SITE_URL/);

    try {
      getServerEnv({
        ...validServerEnv,
        SITE_URL: undefined,
      });
    } catch (error) {
      expect(String(error)).not.toContain(
        validServerEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      );
    }
  });

  it("rejects malformed URLs without echoing their values", () => {
    const malformedUrl = "definitely-not-a-url";

    expect(() =>
      getServerEnv({
        ...validServerEnv,
        SITE_URL: malformedUrl,
      }),
    ).toThrowError(/SITE_URL/);

    try {
      getServerEnv({ ...validServerEnv, SITE_URL: malformedUrl });
    } catch (error) {
      expect(String(error)).not.toContain(malformedUrl);
    }
  });
});
