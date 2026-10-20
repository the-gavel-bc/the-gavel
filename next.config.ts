import type { NextConfig } from "next";

// Foundation routes use ordinary server rendering. User-specific pages must
// never enter shared caches; public content caching belongs to a later phase.
const nextConfig: NextConfig = {
  // Keep the repository's authored project instructions stable during startup.
  agentRules: false,
};
export default nextConfig;
