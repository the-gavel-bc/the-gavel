import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  acquire: vi.fn(),
  release: vi.fn(),
  process: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/backend/auth/access/access", () => ({ getCurrentAccess: m.access }));
vi.mock("@/backend/media/image-intake/processing-gate", () => ({
  acquireImageProcessing: m.acquire,
}));
vi.mock("./profile-photo", () => ({ processProfilePhoto: m.process }));
vi.mock("@/backend/infrastructure/supabase/server/server", () => ({
  createServerSupabaseClient: async () => ({ rpc: m.rpc }),
}));
import { saveProfilePhotoAction } from "./profile-photo-actions";

const form = () => {
  const data = new FormData();
  data.append(
    "photo",
    new File([new Uint8Array([1])], "p.png", { type: "image/png" }),
  );
  return data;
};
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ status: "active", role: "author" });
  m.acquire.mockReturnValue(m.release);
  m.process.mockResolvedValue({ ok: true, bytes: new Uint8Array([1, 2]) });
  m.rpc.mockResolvedValue({ data: { ok: true }, error: null });
});

describe("saveProfilePhotoAction", () => {
  it("does not decode anything when the processing gate is full", async () => {
    m.acquire.mockReturnValue(null);
    expect(await saveProfilePhotoAction(form())).toEqual({
      ok: false,
      code: "unavailable",
    });
    expect(m.process).not.toHaveBeenCalled();
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("releases the gate even when decoding fails", async () => {
    m.process.mockRejectedValue(new Error("boom"));
    expect(await saveProfilePhotoAction(form())).toEqual({
      ok: false,
      code: "unavailable",
    });
    expect(m.release).toHaveBeenCalledOnce();
  });
  it("reports the database rate limit", async () => {
    m.rpc.mockResolvedValue({
      data: { ok: false, code: "rate_limited" },
      error: null,
    });
    expect(await saveProfilePhotoAction(form())).toEqual({
      ok: false,
      code: "rate_limited",
    });
  });
  it("saves a processed photo", async () => {
    expect(await saveProfilePhotoAction(form())).toEqual({ ok: true });
    expect(m.release).toHaveBeenCalledOnce();
  });
});
