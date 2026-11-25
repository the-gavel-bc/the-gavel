import "server-only";

import { createHash } from "node:crypto";
import sharp from "sharp";

const maxBytes = 10 * 1024 * 1024;
const maxSide = 6_000;
const maxPixels = 24_000_000;
// Stored photos are capped at this long edge: sharp on a 2x screen at full
// article width, and far smaller files than camera originals.
const storedMaxSide = 2_400;
const allowedFormats = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

export async function processArticleImage(
  bytes: Uint8Array,
  declaredType: string,
): Promise<
  | {
      ok: true;
      bytes: Uint8Array;
      contentType: "image/webp";
      width: number;
      height: number;
      sha256: string;
    }
  | {
      ok: false;
      code:
        "invalid_type" | "invalid_image" | "invalid_dimensions" | "too_large";
    }
> {
  if (!Object.values(allowedFormats).includes(declaredType as "image/webp"))
    return { ok: false, code: "invalid_type" };
  if (bytes.byteLength < 1) return { ok: false, code: "invalid_image" };
  if (bytes.byteLength > maxBytes) return { ok: false, code: "too_large" };

  try {
    const input = Buffer.from(bytes);
    const metadata = await sharp(input, {
      // Header inspection does not decode pixels; check explicit bounds before decoding.
      limitInputPixels: false,
      failOn: "error",
    }).metadata();
    if (
      metadata.format !== "jpeg" &&
      metadata.format !== "png" &&
      metadata.format !== "webp"
    )
      return { ok: false, code: "invalid_type" };
    if (allowedFormats[metadata.format] !== declaredType)
      return { ok: false, code: "invalid_type" };
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width > maxSide ||
      metadata.height > maxSide ||
      metadata.width * metadata.height > maxPixels ||
      (metadata.pages ?? 1) !== 1
    )
      return { ok: false, code: "invalid_dimensions" };

    const output = await sharp(input, {
      limitInputPixels: maxPixels,
      failOn: "error",
    })
      .rotate()
      .resize({
        width: storedMaxSide,
        height: storedMaxSide,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    if (output.data.byteLength > maxBytes)
      return { ok: false, code: "too_large" };
    if (
      output.info.width > maxSide ||
      output.info.height > maxSide ||
      output.info.width * output.info.height > maxPixels
    )
      return { ok: false, code: "invalid_dimensions" };
    return {
      ok: true,
      bytes: output.data,
      contentType: "image/webp",
      width: output.info.width,
      height: output.info.height,
      sha256: createHash("sha256").update(output.data).digest("hex"),
    };
  } catch {
    return { ok: false, code: "invalid_image" };
  }
}
