import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/backend/infrastructure/supabase/media-admin/media-admin", () => ({
  createTrustedMediaClient: () => ({
    rpc: mocks.rpc,
    storage: { from: () => ({ remove: mocks.remove }) },
  }),
}));
import { expireUnusedUploads, RETENTION_DAYS } from "./unused-upload-expiry";

const id = (n: number) =>
  `70000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const row = (n: number) => ({ asset_id: id(n), object_key: `k/${n}.webp` });
beforeEach(() => vi.resetAllMocks());

it("claims, deletes the object, then completes each image until none are left", async () => {
  mocks.remove.mockResolvedValue({ error: null });
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === "claim_expired_unused_uploads")
      return {
        data:
          mocks.rpc.mock.calls.filter((c) => c[0] === name).length === 1
            ? [row(1), row(2)]
            : [],
        error: null,
      };
    return { data: { ok: true, replayed: false }, error: null };
  });
  expect(await expireUnusedUploads()).toEqual({
    ok: true,
    claimed: 2,
    deleted: 2,
    failed: 0,
  });
  expect(mocks.rpc).toHaveBeenCalledWith("claim_expired_unused_uploads", {
    p_older_than: `${RETENTION_DAYS} days`,
    p_limit: 25,
  });
  expect(mocks.remove).toHaveBeenCalledWith(["k/1.webp"]);
  expect(mocks.rpc).toHaveBeenCalledWith("complete_expired_unused_upload", {
    p_asset_id: id(2),
  });
});

it("never completes an image whose object could not be deleted, and stops without progress", async () => {
  mocks.remove.mockResolvedValue({ error: { message: "nope" } });
  mocks.rpc.mockResolvedValue({ data: [row(1)], error: null });
  const result = await expireUnusedUploads();
  expect(result).toEqual({ ok: false, claimed: 1, deleted: 0, failed: 1 });
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.rpc).not.toHaveBeenCalledWith(
    "complete_expired_unused_upload",
    expect.anything(),
  );
});

it("reports a refused completion as failed and a broken claim as not ok", async () => {
  mocks.remove.mockResolvedValue({ error: null });
  mocks.rpc.mockImplementation(async (name: string) =>
    name === "claim_expired_unused_uploads"
      ? { data: [row(1)], error: null }
      : { data: { ok: false, code: "conflict" }, error: null },
  );
  expect(await expireUnusedUploads()).toMatchObject({ ok: false, failed: 1 });
  mocks.rpc.mockReset();
  mocks.rpc.mockResolvedValue({ data: null, error: { message: "db" } });
  expect(await expireUnusedUploads()).toMatchObject({ ok: false, claimed: 0 });
  mocks.rpc.mockResolvedValue({ data: [{ asset_id: "bad" }], error: null });
  expect(await expireUnusedUploads()).toMatchObject({ ok: false });
});

it("stops when the time budget is spent", async () => {
  let t = 0;
  const now = () => (t += 30_000);
  mocks.rpc.mockResolvedValue({ data: [], error: null });
  await expireUnusedUploads(now);
  expect(mocks.rpc.mock.calls.length).toBeLessThanOrEqual(1);
});

it("treats Storage results as table-driven: an empty success completes, an error or throw never does", async () => {
  const cases: [string, () => Promise<unknown>, boolean][] = [
    [
      "empty success (already gone)",
      async () => ({ data: [], error: null }),
      true,
    ],
    [
      "storage error",
      async () => ({ error: { message: "x", statusCode: "500" } }),
      false,
    ],
    ["network failure", async () => Promise.reject(new Error("boom")), false],
  ];
  for (const [label, remove, completes] of cases) {
    vi.resetAllMocks();
    mocks.remove.mockImplementation(remove);
    let claims = 0;
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_expired_unused_uploads")
        return { data: ++claims === 1 ? [row(1)] : [], error: null };
      return { data: { ok: true, replayed: false }, error: null };
    });
    const result = await expireUnusedUploads();
    expect(result.deleted, label).toBe(completes ? 1 : 0);
    expect(
      mocks.rpc.mock.calls.some(
        (c) => c[0] === "complete_expired_unused_upload",
      ),
      label,
    ).toBe(completes);
  }
});
