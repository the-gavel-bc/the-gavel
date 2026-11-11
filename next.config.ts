import type { NextConfig } from "next";

// Foundation routes use ordinary server rendering. User-specific pages must
// never enter shared caches; public content caching belongs to a later phase.
const nextConfig: NextConfig = {
  // Keep the repository's authored project instructions stable during startup.
  agentRules: false,
  // Resolve live visibility/metadata before flushing the initial document head.
  htmlLimitedBots: /.*/,
  async headers() {
    return [
      "/dashboard/:path*",
      "/sign-in",
      "/access-pending",
      "/auth/:path*",
      "/search",
      "/api/articles/:path*",
      "/api/internal/:path*",
    ].map((source) => ({
      source,
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
    }));
  },
  // Flight transport includes metadata/encoding overhead beyond the 1 MiB draft body.
  experimental: { serverActions: { bodySizeLimit: 4 * 1024 * 1024 } },
};
export default nextConfig;
