import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), cookies: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.create }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/backend/infrastructure/env/server/server", () => ({
  getServerEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-test-key",
    SITE_URL: "http://localhost:3000",
  }),
}));
import { createServerSupabaseClient } from "./server";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookies.mockResolvedValue({ getAll: () => [], set: vi.fn() });
});
it("uses the public key and forces private requests out of the fetch cache", async () => {
  const response = new Response("{}", { status: 200 });
  const network = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", network);
  try {
    await createServerSupabaseClient();
    const [url, key, options] = mocks.create.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:54321");
    expect(key).toBe("public-test-key");
    const init = {
      method: "POST",
      headers: { "x-test": "kept" },
      body: "{}",
      cache: "force-cache",
    };
    expect(
      await options.global.fetch(`${url}/rest/v1/rpc/save_article_draft`, init),
    ).toBe(response);
    expect(network).toHaveBeenCalledWith(
      `${url}/rest/v1/rpc/save_article_draft`,
      { ...init, cache: "no-store" },
    );
  } finally {
    vi.unstubAllGlobals();
  }
});
