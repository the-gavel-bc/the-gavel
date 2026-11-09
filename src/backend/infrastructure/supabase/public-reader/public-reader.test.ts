import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/backend/infrastructure/env/server/server", () => ({
  getServerEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-key",
    SITE_URL: "https://example.com",
  }),
}));
import { createPublicReaderClient } from "./public-reader";

describe("public reader client", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("uses only the publishable key and disables sessions and fetch caching", async () => {
    createPublicReaderClient();
    const [url, key, options] = mocks.createClient.mock.calls[0];
    expect(url).toBe("https://example.supabase.co");
    expect(key).toBe("public-key");
    expect(options.auth).toEqual({
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    });
    expect(options.cookies).toBeUndefined();
    const fetchMock = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal("fetch", fetchMock);
    await options.global.fetch("https://example.com", { cache: "force-cache" });
    expect(fetchMock).toHaveBeenCalledWith("https://example.com", {
      cache: "no-store",
    });
  });
});
