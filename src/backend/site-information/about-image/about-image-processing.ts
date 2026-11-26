import "server-only";
// Kept apart from about-image.ts so the pages that only read the image URL
// (/about and Site information) do not bundle sharp.
import sharp from "sharp";

const maxBytes = 5 * 1024 * 1024;
const maxSide = 8_000;
const maxPixels = 40_000_000;
const types = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
export const aboutImageWidth = 1600;

// Re-encode every upload to a WebP no wider than 1600px, so nothing the
// administrator sent is stored or served as-is (metadata dropped, rotated).
export async function processAboutImage(
  bytes: Uint8Array,
  declaredType: string,
): Promise<
  | { ok: true; bytes: Uint8Array }
  | { ok: false; code: "invalid_type" | "invalid_image" | "too_large" }
> {
  if (!Object.values(types).includes(declaredType))
    return { ok: false, code: "invalid_type" };
  if (bytes.byteLength < 1) return { ok: false, code: "invalid_image" };
  if (bytes.byteLength > maxBytes) return { ok: false, code: "too_large" };
  try {
    const input = Buffer.from(bytes);
    const meta = await sharp(input, {
      limitInputPixels: false,
      failOn: "error",
    }).metadata();
    if (
      !meta.format ||
      !(meta.format in types) ||
      types[meta.format as keyof typeof types] !== declaredType
    )
      return { ok: false, code: "invalid_type" };
    if (
      !meta.width ||
      !meta.height ||
      meta.width > maxSide ||
      meta.height > maxSide ||
      meta.width * meta.height > maxPixels ||
      (meta.pages ?? 1) !== 1
    )
      return { ok: false, code: "invalid_image" };
    const output = await sharp(input, {
      limitInputPixels: maxPixels,
      failOn: "error",
    })
      .rotate()
      .resize({ width: aboutImageWidth, withoutEnlargement: true })
      .webp({ quality: 80, effort: 4 })
      .toBuffer();
    // The database caps the stored image at 1 MiB.
    if (output.byteLength > 1_048_576) return { ok: false, code: "too_large" };
    return { ok: true, bytes: output };
  } catch {
    return { ok: false, code: "invalid_image" };
  }
}
