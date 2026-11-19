import sharp from "sharp";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { processProfilePhoto, profilePhotoSize } from "./profile-photo";

const png = (width: number, height: number) =>
  sharp({
    create: { width, height, channels: 3, background: "#336699" },
  })
    .png()
    .toBuffer();

it("re-encodes any image to a small square WebP", async () => {
  const result = await processProfilePhoto(await png(800, 400), "image/png");
  if (!result.ok) throw new Error("expected success");
  const meta = await sharp(Buffer.from(result.bytes)).metadata();
  expect(meta.format).toBe("webp");
  expect([meta.width, meta.height]).toEqual([
    profilePhotoSize,
    profilePhotoSize,
  ]);
  expect(result.bytes.byteLength).toBeLessThan(524288);
  expect(Buffer.from(result.bytes).subarray(0, 4).toString()).toBe("RIFF");
});

it("rejects wrong types, mismatched types, empty and oversized input", async () => {
  const bytes = await png(10, 10);
  expect(await processProfilePhoto(bytes, "image/gif")).toEqual({
    ok: false,
    code: "invalid_type",
  });
  expect(await processProfilePhoto(bytes, "image/jpeg")).toEqual({
    ok: false,
    code: "invalid_type",
  });
  expect(await processProfilePhoto(new Uint8Array(), "image/png")).toEqual({
    ok: false,
    code: "invalid_image",
  });
  expect(
    await processProfilePhoto(new Uint8Array(3 * 1024 * 1024 + 1), "image/png"),
  ).toEqual({ ok: false, code: "too_large" });
  expect(
    await processProfilePhoto(new Uint8Array([1, 2, 3, 4]), "image/png"),
  ).toEqual({ ok: false, code: "invalid_image" });
});
