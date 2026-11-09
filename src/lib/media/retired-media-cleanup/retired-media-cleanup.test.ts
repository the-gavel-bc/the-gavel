import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
  upload: vi.fn(),
}));
vi.mock("@/lib/supabase/media-admin/media-admin", () => ({
  createTrustedMediaClient: () => ({
    rpc: m.rpc,
    storage: {
      from: () => ({ list: m.list, remove: m.remove, upload: m.upload }),
    },
  }),
}));
import { runRetiredMediaCleanup } from "./retired-media-cleanup";
const article = "85000000-0000-4000-8000-000000000001";
const asset = "85000000-0000-4000-8000-000000000002";
const token = "85000000-0000-4000-8000-000000000003";
describe("retired media cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.rpc.mockImplementation(async (name: string) => {
      if (name === "start_media_cleanup_run")
        return { data: token, error: null };
      if (name === "get_media_cleanup_probe")
        return {
          data: [{ object_key: "probe/probe.webp", armed: true }],
          error: null,
        };
      if (name === "get_media_cleanup_backlog")
        return { data: { staleKeys: 0, stalePrefixes: 0 }, error: null };
      if (name === "claim_retired_article_prefixes")
        return {
          data: [{ article_id: article, scan_offset: 0, claim_token: token }],
          error: null,
        };
      if (name === "claim_media_cleanup")
        return {
          data: [
            { object_key: `${article}/${asset}.webp`, claim_token: token },
          ],
          error: null,
        };
      return { data: true, error: null };
    });
    m.list.mockImplementation(async (path: string) =>
      path === "probe"
        ? { data: [], error: null }
        : { data: [{ name: `${asset}.webp` }], error: null },
    );
    m.remove.mockResolvedValue({ data: [], error: null });
    m.upload.mockResolvedValue({ data: {}, error: null });
  });
  it("registers only canonical discovered keys and sweeps claimed keys", async () => {
    expect(await runRetiredMediaCleanup()).toEqual({ ok: true });
    expect(m.rpc).toHaveBeenCalledWith("register_retired_media_keys", {
      p_article_id: article,
      p_asset_ids: [asset],
      p_claim_token: token,
    });
    expect(m.remove).toHaveBeenCalledWith([`${article}/${asset}.webp`]);
    expect(m.rpc).toHaveBeenCalledWith("finish_media_cleanup_run", {
      p_token: token,
      p_success: true,
    });
  });
  it("does not mark an inaccessible bucket healthy", async () => {
    m.list.mockResolvedValue({ data: null, error: { message: "offline" } });
    expect(await runRetiredMediaCleanup()).toEqual({ ok: false });
    expect(m.rpc).toHaveBeenCalledWith("finish_media_cleanup_run", {
      p_token: token,
      p_success: false,
    });
  });
  it("reports unexpected prefix entries without deleting them", async () => {
    m.list.mockImplementation(async (path: string) =>
      path === "probe"
        ? { data: [], error: null }
        : { data: [{ name: "unexpected.txt" }], error: null },
    );
    expect(await runRetiredMediaCleanup()).toEqual({ ok: false });
    expect(m.rpc).toHaveBeenCalledWith(
      "finish_retired_article_scan_v2",
      expect.objectContaining({ p_page_read: true, p_clean: false }),
    );
  });
  it("keeps uppercase filenames quarantined instead of registering a different lowercase key", async () => {
    const upper = "ABCDEFAB-0000-4000-8000-000000000002.webp";
    m.list.mockImplementation(async (path: string) =>
      path === "probe"
        ? { data: [], error: null }
        : { data: [{ name: upper }], error: null },
    );
    expect(await runRetiredMediaCleanup()).toEqual({ ok: false });
    expect(m.rpc).toHaveBeenCalledWith(
      "register_retired_media_keys",
      expect.objectContaining({ p_asset_ids: [] }),
    );
    expect(m.rpc).toHaveBeenCalledWith(
      "finish_retired_article_scan_v2",
      expect.objectContaining({ p_page_read: true, p_clean: false }),
    );
  });
  it("fails readiness when the Storage probe cannot be removed", async () => {
    m.remove.mockResolvedValue({ data: null, error: { message: "denied" } });
    expect(await runRetiredMediaCleanup()).toEqual({ ok: false });
    expect(m.rpc).not.toHaveBeenCalledWith(
      "claim_retired_article_prefixes",
      expect.anything(),
    );
    expect(m.rpc).toHaveBeenCalledWith("finish_media_cleanup_run", {
      p_token: token,
      p_success: false,
    });
  });
  it("records failures and never marks a failing run healthy", async () => {
    m.remove.mockImplementation(async (keys: string[]) =>
      keys[0] === "probe/probe.webp"
        ? { data: [], error: null }
        : { data: null, error: { message: "offline" } },
    );
    expect(await runRetiredMediaCleanup()).toEqual({ ok: false });
    expect(m.rpc).toHaveBeenCalledWith("finish_media_cleanup", {
      p_object_key: `${article}/${asset}.webp`,
      p_claim_token: token,
      p_success: false,
    });
    expect(m.rpc).toHaveBeenCalledWith("finish_media_cleanup_run", {
      p_token: token,
      p_success: false,
    });
  });
});
