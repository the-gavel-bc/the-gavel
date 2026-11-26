import "server-only";
import sharp from "sharp";
import type { PublicImageWidth } from "@/shared/reader/public-image/public-image";

/**
 * Downscales an already verified public WebP to `width`. Originals that are
 * not wider are returned unchanged, so a variant is never larger.
 */
export async function resizePublicImage(
  bytes: ArrayBuffer,
  width: PublicImageWidth,
): Promise<ArrayBuffer | Uint8Array<ArrayBuffer>> {
  const input = Buffer.from(bytes);
  const { width: stored } = await sharp(input, { failOn: "error" }).metadata();
  if (!stored || stored <= width) return bytes;
  const output = await sharp(input, { failOn: "error" })
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 80, effort: 4 })
    .toBuffer();
  return new Uint8Array(output);
}
