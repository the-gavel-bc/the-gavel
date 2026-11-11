import { expect, it, vi } from "vitest";
vi.mock("@/backend/infrastructure/env/server/server", () => ({
  getServerEnv: () => ({ SITE_URL: "https://gavel.example" }),
}));
import config from "../../../../next.config";
import { generateMetadata } from "@/app/layout";
it("uses a trusted metadata base without an inherited public canonical/social card", async () => {
  const metadata = await generateMetadata();
  expect(new URL(metadata.metadataBase!.toString()).origin).toBe(
    "https://gavel.example",
  );
  expect(metadata.alternates).toBeUndefined();
  expect(metadata.openGraph).toBeUndefined();
});
it("blocks streamed metadata and adds robots headers to private/search families", async () => {
  expect(config.htmlLimitedBots?.test("Mozilla/5.0")).toBe(true);
  const headers = await config.headers!();
  for (const source of [
    "/dashboard/:path*",
    "/sign-in",
    "/access-pending",
    "/auth/:path*",
    "/search",
    "/api/articles/:path*",
    "/api/internal/:path*",
  ]) {
    expect(
      headers.find((header) => header.source === source)?.headers,
    ).toContainEqual({
      key: "X-Robots-Tag",
      value: "noindex, nofollow, noarchive",
    });
  }
});
