import type { MetadataRoute } from "next";
import { getServerEnv } from "@/backend/infrastructure/env/server/server";

// Advisory only: authorization and noindex headers protect private routes.
// Trailing slashes matter; "/auth" would also block "/authors".
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/api/public/"],
      disallow: [
        "/dashboard",
        "/auth/",
        "/sign-in",
        "/access-pending",
        // Crawlers must not spend the shared database-wide search budget.
        "/search",
        "/api/",
      ],
    },
    sitemap: new URL("/sitemap.xml", getServerEnv().SITE_URL).href,
  };
}
