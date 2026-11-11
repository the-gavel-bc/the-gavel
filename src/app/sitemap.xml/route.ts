import { getPublicSitemap } from "@/backend/reader/public-sitemap/public-sitemap";

// Publication state is checked on every request; never prerender or cache.
export const dynamic = "force-dynamic";
const noStore = "private, no-cache, no-store, max-age=0, must-revalidate";

const escape = (value: string) =>
  value.replace(
    /[&<>"']/gu,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );

export async function GET() {
  const result = await getPublicSitemap();
  if (result.kind !== "ok") {
    const limited = result.kind === "rate_limited";
    return new Response("Sitemap temporarily unavailable", {
      status: 503,
      headers: {
        "Cache-Control": noStore,
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        ...(limited && { "Retry-After": String(result.retryAfter) }),
      },
    });
  }
  const urls = result.entries
    .map(
      ({ url, lastModified }) =>
        `<url><loc>${escape(url)}</loc>${lastModified ? `<lastmod>${escape(lastModified)}</lastmod>` : ""}</url>`,
    )
    .join("\n");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    {
      headers: {
        "Cache-Control": noStore,
        "Content-Type": "application/xml; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
