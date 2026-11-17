import { afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@/backend/media/unused-upload-expiry/unused-upload-expiry", () => ({
  expireUnusedUploads: m.run,
}));
import { GET } from "./route";
const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
  vi.clearAllMocks();
});
describe("scheduled unused-upload expiry", () => {
  it("rejects missing secrets and preview deployments without invoking cleanup", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.CRON_SECRET = "x".repeat(32);
    expect(
      (
        await GET(
          new Request("https://example.test", {
            headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
          }),
        )
      ).status,
    ).toBe(404);
    process.env.VERCEL_ENV = "production";
    delete process.env.CRON_SECRET;
    expect((await GET(new Request("https://example.test"))).status).toBe(401);
    expect(m.run).not.toHaveBeenCalled();
  });
  it("runs only with the configured production secret", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.CRON_SECRET = "x".repeat(32);
    m.run.mockResolvedValue({ ok: true });
    expect(
      (
        await GET(
          new Request("https://example.test", {
            headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
          }),
        )
      ).status,
    ).toBe(200);
    expect(m.run).toHaveBeenCalledOnce();
  });
});
