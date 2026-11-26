// Widths the public media route can resize to (`?w=`). Anything else is 404,
// so callers cannot create arbitrary CDN cache entries.
export const PUBLIC_IMAGE_WIDTHS = [480, 960, 1600] as const;
export type PublicImageWidth = (typeof PUBLIC_IMAGE_WIDTHS)[number];

export function parsePublicImageWidth(
  value: string | null,
): PublicImageWidth | null | "invalid" {
  if (value === null) return null;
  const width = PUBLIC_IMAGE_WIDTHS.find((w) => String(w) === value);
  return width ?? "invalid";
}

/**
 * `srcset` for a public article image: each smaller resize width plus the
 * stored original. Private (dashboard and preview) URLs get none.
 */
export function publicImageSrcSet(src: string, width?: number) {
  if (!src.startsWith("/api/public/articles/") || !width) return undefined;
  const smaller = PUBLIC_IMAGE_WIDTHS.filter((w) => w < width);
  if (!smaller.length) return undefined;
  return [
    ...smaller.map((w) => `${src}?w=${w} ${w}w`),
    `${src} ${width}w`,
  ].join(", ");
}

// `sizes` for photos in the article column (header and body images).
// Measured: 295px at a 375px viewport, 656px at 768, 736px at 1440.
export const ARTICLE_IMAGE_SIZES = "(min-width: 48rem) 46rem, 100vw";

// `sizes` for story images, by placement. Each value is the rendered CSS
// width measured at 375, 768, 1024 and 1440px viewports (2026-11-26); update
// it when a layout changes. A slight overestimate only costs a larger file.
export const STORY_IMAGE_SIZES = {
  // 327, 720, 613, 770px
  hero: "(min-width: 56rem) 48rem, 100vw",
  // fixed 168px thumbnail
  latest: "10.5rem",
  // 262, 348, 309, 290px
  featured: "22rem",
  // 262, 344, 472, 284px; also related stories on article pages
  card: "(min-width: 64rem) 30rem, (min-width: 40rem) 45vw, 70vw",
  // 295, 656, 647px
  archiveLead: "(min-width: 48rem) 41rem, 100vw",
  // fixed 128px thumbnail
  footer: "8rem",
} as const;
