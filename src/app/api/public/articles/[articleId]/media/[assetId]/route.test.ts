import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/backend/public-media/public-media", () => ({
  readPublicMedia: mocks.read,
}));
import { GET, HEAD } from "./route";
const context = {
  params: Promise.resolve({ articleId: "article", assetId: "asset" }),
};
beforeEach(() => vi.resetAllMocks());
it("caches successful images for five minutes without stale extensions", async () => {
  mocks.read.mockResolvedValue({
    kind: "ok",
    bytes: new Uint8Array([1, 2, 3]),
  });
  const response = await GET(
    new Request("https://example.com", { headers: { "If-None-Match": "old" } }),
    context,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe(
    "public, max-age=300, s-maxage=300, must-revalidate, proxy-revalidate",
  );
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("content-type")).toBe("image/webp");
  expect(mocks.read).toHaveBeenCalledWith("article", "asset");
});
it("HEAD performs the same authorization but returns no body", async () => {
  mocks.read.mockResolvedValue({
    kind: "ok",
    bytes: new Uint8Array([1, 2, 3]),
  });
  const response = await HEAD(
    new Request("https://example.com", { method: "HEAD" }),
    context,
  );
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("");
  expect(response.headers.get("content-length")).toBe("3");
});
it("missing and failed responses never enter caches", async () => {
  for (const [kind, status] of [
    ["notFound", 404],
    ["unavailable", 503],
  ] as const) {
    mocks.read.mockResolvedValue({ kind });
    const response = await GET(new Request("https://example.com"), context);
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  }
});
it("resizes to an allowed width after the original passes its checks", async () => {
  const sharp = (await import("sharp")).default;
  const original = await sharp({
    create: { width: 2000, height: 1000, channels: 3, background: "#123456" },
  })
    .webp()
    .toBuffer();
  mocks.read.mockResolvedValue({
    kind: "ok",
    bytes: original.buffer.slice(
      original.byteOffset,
      original.byteOffset + original.byteLength,
    ),
  });
  const response = await GET(
    new Request("https://example.com/x?w=480"),
    context,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe(
    "public, max-age=300, s-maxage=300, must-revalidate, proxy-revalidate",
  );
  const body = Buffer.from(await response.arrayBuffer());
  expect((await sharp(body).metadata()).width).toBe(480);
  expect(mocks.read).toHaveBeenCalledWith("article", "asset");
});
it("returns the original when it is not wider than the requested width", async () => {
  const sharp = (await import("sharp")).default;
  const small = await sharp({
    create: { width: 300, height: 200, channels: 3, background: "#123456" },
  })
    .webp()
    .toBuffer();
  mocks.read.mockResolvedValue({ kind: "ok", bytes: new Uint8Array(small) });
  const response = await GET(
    new Request("https://example.com/x?w=960"),
    context,
  );
  expect(Buffer.from(await response.arrayBuffer()).equals(small)).toBe(true);
});
it("rejects unlisted widths before reading the image", async () => {
  for (const w of ["123", "960px", ""]) {
    const response = await GET(
      new Request(`https://example.com/x?w=${w}`),
      context,
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  }
  expect(mocks.read).not.toHaveBeenCalled();
});
it("a resized request is still denied when the original is not public", async () => {
  mocks.read.mockResolvedValue({ kind: "notFound" });
  const response = await GET(
    new Request("https://example.com/x?w=480"),
    context,
  );
  expect(response.status).toBe(404);
});
