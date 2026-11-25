import { createHash } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { processArticleImage } from "./image-intake";

async function raster(format: "jpeg" | "png" | "webp", width = 2, height = 3) {
  return sharp({
    create: { width, height, channels: 3, background: "#234567" },
  })
    .toFormat(format)
    .toBuffer();
}

describe("processArticleImage", () => {
  it.each([
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["webp", "image/webp"],
  ] as const)(
    "re-encodes decoded %s into private WebP bytes",
    async (format, mime) => {
      const result = await processArticleImage(await raster(format), mime);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.contentType).toBe("image/webp");
      expect([result.width, result.height]).toEqual([2, 3]);
      expect((await sharp(result.bytes).metadata()).format).toBe("webp");
      expect(result.sha256).toBe(
        createHash("sha256").update(result.bytes).digest("hex"),
      );
    },
  );

  it("caps the stored long edge at 2400 pixels", async () => {
    const result = await processArticleImage(
      await raster("jpeg", 3000, 1500),
      "image/jpeg",
    );
    expect(result.ok && [result.width, result.height]).toEqual([2400, 1200]);
  });

  it("rejects a declared type that disagrees with decoded bytes", async () => {
    const result = await processArticleImage(await raster("png"), "image/jpeg");
    expect(result).toEqual({ ok: false, code: "invalid_type" });
  });

  it("rejects a corrupt image before it reaches trusted Storage", async () => {
    const result = await processArticleImage(
      new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]),
      "image/jpeg",
    );
    expect(result).toEqual({ ok: false, code: "invalid_image" });
  });

  it("rejects input over 10 MiB before decoding", async () => {
    const result = await processArticleImage(
      new Uint8Array(10 * 1024 * 1024 + 1),
      "image/png",
    );
    expect(result).toEqual({ ok: false, code: "too_large" });
  });

  it("rejects a dimension above 6000 pixels", async () => {
    const result = await processArticleImage(
      await raster("png", 6001, 1),
      "image/png",
    );
    expect(result).toEqual({ ok: false, code: "invalid_dimensions" });
  });

  it("rejects more than 24 million decoded pixels", async () => {
    const result = await processArticleImage(
      await raster("png", 5000, 5000),
      "image/png",
    );
    expect(result).toEqual({ ok: false, code: "invalid_dimensions" });
  });

  it("rejects SVG and arbitrary MIME types", async () => {
    const result = await processArticleImage(
      new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      "image/svg+xml",
    );
    expect(result).toEqual({ ok: false, code: "invalid_type" });
  });
});
