import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
  upload: vi.fn(),
}));
vi.mock("@/backend/infrastructure/supabase/media-admin/media-admin", () => ({
  createTrustedMediaClient: () => ({
    rpc: m.rpc,
    storage: {
      from: () => ({ list: m.list, remove: m.remove, upload: m.upload }),
    },
  }),
}));
import {
  FINISH_CONCURRENCY,
  runRetiredMediaCleanup,
} from "./retired-media-cleanup";
const article = "85000000-0000-4000-8000-000000000001";
const asset = "85000000-0000-4000-8000-000000000002";
const token = "85000000-0000-4000-8000-000000000003";
describe("retired media cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    // Each queue yields one batch per run, then reports nothing left to claim.
    const claimed = new Set<string>();
    const once = (name: string, data: unknown) => {
      if (claimed.has(name)) return { data: [], error: null };
      claimed.add(name);
      return { data, error: null };
    };
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
        return once(name, [
          { article_id: article, scan_offset: 0, claim_token: token },
        ]);
      if (name === "claim_media_cleanup")
        return once(name, [
          { object_key: `${article}/${asset}.webp`, claim_token: token },
        ]);
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
  it("keeps claiming batches until the run has covered the backlog", async () => {
    const batch = (start: number) =>
      Array.from({ length: 100 }, (_, i) => ({
        object_key: `${article}/k${start + i}.webp`,
        claim_token: token,
      }));
    const pages = [batch(0), batch(100), []];
    const base = m.rpc.getMockImplementation()!;
    m.rpc.mockImplementation(async (name: string, args: unknown) =>
      name === "claim_media_cleanup"
        ? { data: pages.shift(), error: null }
        : base(name, args),
    );
    expect(await runRetiredMediaCleanup()).toEqual({ ok: true });
    expect(
      m.rpc.mock.calls.filter(([name]) => name === "claim_media_cleanup"),
    ).toHaveLength(3);
    expect(m.rpc).toHaveBeenCalledWith("claim_media_cleanup", { p_limit: 100 });
    // One Storage call per batch, plus the probe.
    expect(m.remove).toHaveBeenCalledTimes(3);
    expect(m.remove).toHaveBeenCalledWith(batch(100).map((c) => c.object_key));
    expect(
      m.rpc.mock.calls.filter(([name]) => name === "finish_media_cleanup"),
    ).toHaveLength(200);
  });
  it("stops claiming when the time budget is spent", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => (now += 15_000));
    const base = m.rpc.getMockImplementation()!;
    m.rpc.mockImplementation(async (name: string, args: unknown) =>
      name === "claim_media_cleanup"
        ? {
            data: [
              { object_key: `${article}/${asset}.webp`, claim_token: token },
            ],
            error: null,
          }
        : base(name, args),
    );
    await runRetiredMediaCleanup();
    expect(
      m.rpc.mock.calls.filter(([name]) => name === "claim_media_cleanup")
        .length,
    ).toBeLessThanOrEqual(3);
  });
  it.each([
    [5_000, false],
    [41_000, false],
    [41_000, true],
  ] as const)(
    "gives keys a turn across runs (latency=%s, failure=%s)",
    async (latency, failure) => {
      let now = 0;
      vi.spyOn(Date, "now").mockImplementation(() => now);
      const base = m.rpc.getMockImplementation()!;
      m.rpc.mockImplementation(async (name: string, args: unknown) => {
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
        return base(name, args);
      });
      m.list.mockImplementation(async (path: string) => {
        if (path === "probe") return { data: [], error: null };
        now += latency;
        return {
          data: failure ? null : [],
          error: failure ? new Error("Storage unavailable") : null,
        };
      });
      await runRetiredMediaCleanup();
      await runRetiredMediaCleanup();
      expect(
        m.rpc.mock.calls.filter(([name]) => name === "claim_media_cleanup"),
      ).toHaveLength(latency === 5_000 ? 16 : 2);
      expect(
        m.remove.mock.calls.filter(([paths]) =>
          paths.includes(`${article}/${asset}.webp`),
        ),
      ).toHaveLength(latency === 5_000 ? 16 : 2);
      if (failure)
        expect(m.rpc).toHaveBeenLastCalledWith("finish_media_cleanup_run", {
          p_token: token,
          p_success: false,
        });
    },
  );
  it("never runs more than the cap of key-finish calls at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const keys = Array.from({ length: 35 }, (_, n) => ({
      object_key: `${article}/${n}.webp`,
      claim_token: token,
    }));
    let served = false;
    const base = m.rpc.getMockImplementation()!;
    m.rpc.mockImplementation(async (name: string, args: unknown) => {
      if (name === "claim_media_cleanup") {
        if (served) return { data: [], error: null };
        served = true;
        return { data: keys, error: null };
      }
      if (name === "finish_media_cleanup") {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return { data: true, error: null };
      }
      return base(name, args);
    });
    m.remove.mockResolvedValue({ error: null });
    await runRetiredMediaCleanup();
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(FINISH_CONCURRENCY);
  });
});
