import { describe, expect, it } from "vitest";
import { getPublicEnv } from "./public";

describe("getPublicEnv", () => {
  it("returns only the two browser-safe Supabase values", () => {
    const result = getPublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_test_key",
      SITE_URL: "http://localhost:3000",
      SUPABASE_SECRET_KEY: "must-never-reach-the-browser",
    });

    expect(result).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_test_key",
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(result).not.toHaveProperty("SITE_URL");
    expect(result).not.toHaveProperty("SUPABASE_SECRET_KEY");
  });

  it("reports malformed public configuration without exposing values", () => {
    const malformedUrl = "not-a-supabase-url";

    try {
      getPublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: malformedUrl,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_test_key",
      });
      expect.unreachable("Expected public environment validation to fail");
    } catch (error) {
      expect(String(error)).toContain("NEXT_PUBLIC_SUPABASE_URL");
      expect(String(error)).not.toContain(malformedUrl);
    }
  });
});
