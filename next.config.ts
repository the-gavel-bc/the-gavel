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
      {
        // Baseline for every response. The nonce-based Content-Security-Policy
        // is set per request in src/proxy.ts for HTML documents.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
          },
          // Ignored over HTTP. No includeSubDomains/preload until the final domain is chosen.
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
      ...[
        "/dashboard/:path*",
        "/sign-in",
        "/access-pending",
        "/auth/:path*",
        "/search",
        "/api/articles/:path*",
        "/api/internal/:path*",
      ].map((source) => ({
        source,
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      })),
    ];
  },
  // Flight transport includes metadata/encoding overhead beyond the 1 MiB draft body.
  experimental: {
    serverActions: { bodySizeLimit: 4 * 1024 * 1024 },
    // Reuse a dynamic page for 30 s on client navigation (Back, repeat clicks).
    // Server actions that call revalidatePath clear this cache, so a member
    // always sees their own changes; other people's changes may lag 30 s.
    staleTimes: { dynamic: 30 },
  },
};
export default nextConfig;
