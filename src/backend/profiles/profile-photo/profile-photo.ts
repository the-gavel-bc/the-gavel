import "server-only";
import sharp from "sharp";

const maxBytes = 3 * 1024 * 1024;
const maxSide = 6_000;
const maxPixels = 24_000_000;
const types = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
export const profilePhotoSize = 384;

// Re-encode every upload to a small square WebP, so nothing the person sent
// is stored or served as-is (metadata is dropped, orientation applied).
export async function processProfilePhoto(
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
      .resize(profilePhotoSize, profilePhotoSize, { fit: "cover" })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
    return { ok: true, bytes: output };
  } catch {
    return { ok: false, code: "invalid_image" };
  }
}
