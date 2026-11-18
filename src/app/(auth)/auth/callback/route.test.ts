import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";
const mocks = vi.hoisted(() => ({ exchange: vi.fn(), access: vi.fn() }));
vi.mock("@/backend/infrastructure/supabase/server/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { exchangeCodeForSession: mocks.exchange },
  }),
}));
vi.mock("@/backend/auth/access/access", () => ({
  getCurrentAccess: mocks.access,
}));
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "local-test-key");
  vi.stubEnv("SITE_URL", "https://publication.example.test");
  mocks.exchange.mockResolvedValue({ error: null });
  mocks.access.mockResolvedValue({ status: "active" });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
it("uses canonical origin and rejects external callback destinations", async () => {
  const response = await GET(
    new Request(
      "https://untrusted-host.test/auth/callback?code=synthetic-code&next=https://attacker.test",
    ),
  );
  expect(response.headers.get("location")).toBe(
    "https://publication.example.test/dashboard",
  );
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(mocks.exchange).toHaveBeenCalledWith("synthetic-code");
});
it("sends unapproved Google sessions to pending access", async () => {
  mocks.access.mockResolvedValue({ status: "pending" });
  const response = await GET(
    new Request(
      "https://publication.example.test/auth/callback?code=synthetic-code",
    ),
  );
  expect(response.headers.get("location")).toBe(
    "https://publication.example.test/access-pending",
  );
});
it("returns a safe recovery URL on exchange failure", async () => {
  mocks.exchange.mockResolvedValue({
    error: { message: "private-token-marker" },
  });
  const response = await GET(
    new Request(
      "https://publication.example.test/auth/callback?code=synthetic-code",
    ),
  );
  expect(response.headers.get("location")).toBe(
    "https://publication.example.test/sign-in?error=callback",
  );
  expect(response.headers.get("location")).not.toContain(
    "private-token-marker",
  );
});
it("handles missing OAuth code without exchanging it", async () => {
  const response = await GET(
    new Request("https://publication.example.test/auth/callback"),
  );
  expect(response.headers.get("location")).toBe(
    "https://publication.example.test/sign-in?error=callback",
  );
  expect(mocks.exchange).not.toHaveBeenCalled();
});
it("honors a safe dashboard destination for an active member", async () => {
  const response = await GET(
    new Request(
      "https://publication.example.test/auth/callback?code=c&next=/dashboard/articles/abc",
    ),
  );
  expect(response.headers.get("location")).toBe(
    "https://publication.example.test/dashboard/articles/abc",
  );
});
it("ignores the destination for people without access", async () => {
  mocks.access.mockResolvedValue({ status: "pending" });
  const response = await GET(
    new Request(
      "https://publication.example.test/auth/callback?code=c&next=/dashboard/admin/members",
    ),
  );
  expect(response.headers.get("location")).toBe(
    "https://publication.example.test/access-pending",
  );
});
it("returns to sign-in with the generic error when the access check throws", async () => {
  mocks.access.mockRejectedValue(
    new Error("Unable to verify membership access."),
  );
  const response = await GET(
    new Request("https://publication.example.test/auth/callback?code=c"),
  );
  expect(response.status).toBeGreaterThanOrEqual(300);
  expect(response.headers.get("location")).toBe(
    "https://publication.example.test/sign-in?error=callback",
  );
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it("treats a session that is signed out after the exchange as an error", async () => {
  mocks.access.mockResolvedValue({ status: "signedOut" });
  const response = await GET(
    new Request("https://publication.example.test/auth/callback?code=c"),
  );
  expect(response.headers.get("location")).toBe(
    "https://publication.example.test/sign-in?error=callback",
  );
});
