import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidate,
  updateTag: vi.fn(),
  unstable_cache: vi.fn(),
}));
vi.mock("@/backend/auth/access/access", () => ({
  getCurrentAccess: mocks.access,
}));
vi.mock("@/backend/infrastructure/supabase/server/server", () => ({
  createServerSupabaseClient: async () => ({ rpc: mocks.rpc }),
}));
import { processAboutImage } from "./about-image-processing";
import {
  removeAboutImageAction,
  saveAboutImageAction,
} from "./about-image-actions";

const png = (width: number, height: number) =>
  sharp({
    create: { width, height, channels: 3, background: "#336699" },
  })
    .png()
    .toBuffer();
const form = (file: Blob, alt = "Newsroom") => {
  const data = new FormData();
  data.set("image", new File([file], "a.png", { type: "image/png" }));
  data.set("alt", alt);
  return data;
};

describe("processAboutImage", () => {
  it("re-encodes to WebP no wider than 1600px", async () => {
    const result = await processAboutImage(
      new Uint8Array(await png(3000, 1000)),
      "image/png",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const meta = await sharp(Buffer.from(result.bytes)).metadata();
    expect([meta.format, meta.width]).toEqual(["webp", 1600]);
  });
  it("rejects a declared type that does not match the bytes", async () => {
    expect(
      await processAboutImage(new Uint8Array(await png(10, 10)), "image/jpeg"),
    ).toEqual({ ok: false, code: "invalid_type" });
  });
  it("rejects non-images", async () => {
    expect(
      await processAboutImage(new Uint8Array([1, 2, 3]), "image/png"),
    ).toEqual({ ok: false, code: "invalid_image" });
  });
});

describe("about image actions", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each(["author", "editor"])(
    "denies %s without calling the database",
    async (role) => {
      mocks.access.mockResolvedValue({ status: "active", role });
      expect(
        await saveAboutImageAction(form(new Blob([await png(10, 10)]))),
      ).toEqual({ ok: false, code: "forbidden" });
      expect(await removeAboutImageAction()).toEqual({
        ok: false,
        code: "forbidden",
      });
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );
  it("requires alt text", async () => {
    mocks.access.mockResolvedValue({ status: "active", role: "administrator" });
    expect(
      await saveAboutImageAction(form(new Blob([await png(10, 10)]), "  ")),
    ).toEqual({ ok: false, code: "invalid_input" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("sends a re-encoded WebP and refreshes the About page", async () => {
    mocks.access.mockResolvedValue({ status: "active", role: "administrator" });
    mocks.rpc.mockResolvedValue({ data: { ok: true }, error: null });
    expect(
      await saveAboutImageAction(form(new Blob([await png(2000, 800)]))),
    ).toEqual({ ok: true });
    const args = mocks.rpc.mock.calls[0];
    expect(args[0]).toBe("set_site_about_image");
    expect(args[1].p_alt).toBe("Newsroom");
    expect(String(args[1].p_bytes).startsWith("\\x52494646")).toBe(true);
    expect(mocks.revalidate).toHaveBeenCalledWith("/about");
  });
  it("reports database refusal and failure safely", async () => {
    mocks.access.mockResolvedValue({ status: "active", role: "administrator" });
    mocks.rpc.mockResolvedValueOnce({
      data: { ok: false, code: "forbidden" },
      error: null,
    });
    expect(await removeAboutImageAction()).toEqual({
      ok: false,
      code: "forbidden",
    });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "x" } });
    expect(await removeAboutImageAction()).toEqual({
      ok: false,
      code: "unavailable",
    });
  });
});
