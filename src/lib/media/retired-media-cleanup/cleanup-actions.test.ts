import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  run: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/lib/auth/access/access", () => ({ getCurrentAccess: m.access }));
vi.mock("./retired-media-cleanup", () => ({ runRetiredMediaCleanup: m.run }));
import { retryMediaCleanupAction } from "./cleanup-actions";
const old = { ...process.env };
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  process.env = { ...old };
});
describe("manual cleanup", () => {
  it("denies authors before any privileged worker runs", async () => {
    m.access.mockResolvedValue({ status: "active", role: "author" });
    expect(await retryMediaCleanupAction()).toEqual({ ok: false });
    expect(m.run).not.toHaveBeenCalled();
  });
  it("fails closed when production scheduling is unconfigured", async () => {
    process.env.VERCEL_ENV = "production";
    delete process.env.CRON_SECRET;
    m.access.mockResolvedValue({ status: "active", role: "administrator" });
    expect(await retryMediaCleanupAction()).toEqual({ ok: false });
    expect(m.run).not.toHaveBeenCalled();
  });
  it("rejects previews and nonlocal development before creating a privileged client", async () => {
    m.access.mockResolvedValue({ status: "active", role: "administrator" });
    process.env.VERCEL_ENV = "preview";
    expect(await retryMediaCleanupAction()).toEqual({ ok: false });
    delete process.env.VERCEL_ENV;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://hosted.example";
    expect(await retryMediaCleanupAction()).toEqual({ ok: false });
    expect(m.run).not.toHaveBeenCalled();
  });
  it("lets administrators retry a bounded sweep", async () => {
    delete process.env.VERCEL_ENV;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    m.access.mockResolvedValue({ status: "active", role: "administrator" });
    m.run.mockResolvedValue({ ok: true });
    expect(await retryMediaCleanupAction()).toEqual({ ok: true });
    expect(m.run).toHaveBeenCalledOnce();
  });
});
