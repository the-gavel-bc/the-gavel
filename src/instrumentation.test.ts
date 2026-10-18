import { afterEach, expect, it, vi } from "vitest";
import { register } from "./instrumentation";
afterEach(() => vi.unstubAllEnvs());
it("rejects missing startup configuration without echoing secrets", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "private-test-marker");
  vi.stubEnv("SITE_URL", undefined);
  expect(() => register()).toThrow(/SITE_URL/);
  expect(() => register()).not.toThrow(/private-test-marker/);
});
it("allows a configured server to start", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "local-test-key");
  vi.stubEnv("SITE_URL", "http://localhost:3000");
  expect(() => register()).not.toThrow();
});
