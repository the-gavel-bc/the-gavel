import { afterEach, describe, expect, it } from "vitest";
import { refuseCronRequest } from "./cron-auth";

const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
});
const secret = "s".repeat(32);
const request = (authorization?: string) =>
  new Request("https://example.test/api/internal/x", {
    headers: authorization ? { authorization } : {},
  });

describe("refuseCronRequest", () => {
  it("is closed outside production", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.CRON_SECRET = secret;
    expect(refuseCronRequest(request(`Bearer ${secret}`))?.status).toBe(404);
  });
  it.each([
    ["no header", undefined],
    ["wrong secret of the same length", `Bearer ${"t".repeat(32)}`],
    ["shorter value", "Bearer short"],
    ["longer value", `Bearer ${secret}extra`],
    ["missing scheme", secret],
    ["wrong scheme", `Basic ${secret}`],
  ])("refuses %s with 401 and no caching", (_label, header) => {
    process.env.VERCEL_ENV = "production";
    process.env.CRON_SECRET = secret;
    const refusal = refuseCronRequest(request(header));
    expect(refusal?.status).toBe(401);
    expect(refusal?.headers.get("cache-control")).toBe("no-store");
  });
  it("refuses a configured secret under 32 characters even when it matches", () => {
    process.env.VERCEL_ENV = "production";
    process.env.CRON_SECRET = "s".repeat(31);
    expect(refuseCronRequest(request(`Bearer ${"s".repeat(31)}`))?.status).toBe(
      401,
    );
  });
  it("allows the exact production secret", () => {
    process.env.VERCEL_ENV = "production";
    process.env.CRON_SECRET = secret;
    expect(refuseCronRequest(request(`Bearer ${secret}`))).toBeNull();
  });
});
