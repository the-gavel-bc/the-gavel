import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), download: vi.fn() }));
vi.mock(
  "@/backend/infrastructure/supabase/public-reader/public-reader",
  () => ({
    createPublicReaderClient: () => ({
      rpc: mocks.rpc,
      storage: { from: () => ({ download: mocks.download }) },
    }),
  }),
);
import { readPublicMedia } from "./public-media";
const article = "56000000-0000-0000-0000-000000000099";
const asset = "66000000-0000-0000-0000-000000000099";
const image = Buffer.from(
  "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA",
  "base64",
);
describe("readPublicMedia", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.rpc.mockResolvedValue({
      data: {
        kind: "ok",
        byteSize: image.length,
        sha256: createHash("sha256").update(image).digest("hex"),
      },
      error: null,
    });
    mocks.download.mockResolvedValue({
      data: new Blob([image], { type: "image/webp" }),
      error: null,
    });
  });
  it("reads an authorized canonical image without private metadata", async () => {
    expect((await readPublicMedia(article, asset)).kind).toBe("ok");
    expect(mocks.download).toHaveBeenCalledWith(`${article}/${asset}.webp`);
  });
  it("rejects malformed IDs before accessing Supabase", async () => {
    expect(await readPublicMedia("bad", asset)).toEqual({ kind: "notFound" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not download unpublished or substituted images", async () => {
    mocks.rpc.mockResolvedValue({ data: { kind: "notFound" }, error: null });
    expect(await readPublicMedia(article, asset)).toEqual({ kind: "notFound" });
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it("handles revocation between metadata and Storage download", async () => {
    mocks.download.mockResolvedValue({
      data: null,
      error: { statusCode: "400" },
    });
    expect(await readPublicMedia(article, asset)).toEqual({ kind: "notFound" });
  });
  it("never returns corrupted or incorrectly sized bytes", async () => {
    mocks.download.mockResolvedValue({
      data: new Blob(["not webp"], { type: "image/webp" }),
      error: null,
    });
    expect(await readPublicMedia(article, asset)).toEqual({
      kind: "unavailable",
    });
  });
  it("rejects same-size corruption even when the WebP header matches", async () => {
    const corrupt = Buffer.from(image);
    corrupt[corrupt.length - 1] ^= 1;
    mocks.download.mockResolvedValue({
      data: new Blob([corrupt], { type: "image/webp" }),
      error: null,
    });
    expect(await readPublicMedia(article, asset)).toEqual({
      kind: "unavailable",
    });
  });
  it("maps backend errors to safe unavailable results", async () => {
    mocks.rpc.mockRejectedValue(new Error("secret"));
    expect(await readPublicMedia(article, asset)).toEqual({
      kind: "unavailable",
    });
  });
});
