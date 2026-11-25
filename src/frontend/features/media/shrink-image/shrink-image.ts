// Vercel rejects function request bodies over 4.5 MB, so large photos are
// downscaled in the browser before upload. The server still validates and
// re-encodes every file; this only keeps the request small.
const maxUploadBytes = 3.5 * 1024 * 1024;

export type ShrinkResult = { ok: true; file: File } | { ok: false };

async function encode(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Returns the file unchanged when it is already small enough, otherwise a
 * re-encoded copy whose longest side is at most `maxSide` pixels.
 */
export async function shrinkImage(
  file: File,
  { maxSide = 2400, maxBytes = maxUploadBytes } = {},
): Promise<ShrinkResult> {
  if (typeof createImageBitmap !== "function")
    return file.size <= maxBytes ? { ok: true, file } : { ok: false };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Not decodable here; let the server give the real error.
    return file.size <= maxBytes ? { ok: true, file } : { ok: false };
  }
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= maxBytes) return { ok: true, file };
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas
      .getContext("2d")
      ?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    // WebP keeps PNG transparency; browsers that cannot encode it return PNG,
    // so fall back to JPEG for photos.
    for (const [type, quality] of [
      ["image/webp", 0.85],
      ["image/jpeg", 0.85],
      ["image/jpeg", 0.7],
    ] as const) {
      const blob = await encode(canvas, type, quality);
      if (blob && blob.type === type && blob.size <= maxBytes) {
        const name = file.name.replace(/\.[^.]*$/u, "") || "image";
        const extension = type === "image/webp" ? "webp" : "jpg";
        return {
          ok: true,
          file: new File([blob], `${name}.${extension}`, { type }),
        };
      }
    }
    return { ok: false };
  } finally {
    bitmap.close();
  }
}
