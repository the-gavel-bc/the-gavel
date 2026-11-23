import { beforeEach, afterEach, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/backend/infrastructure/supabase/service/service", () => ({
  createServiceSupabaseClient: () => ({ rpc }),
}));

import { GET } from "./route";

const key = "x".repeat(32);
const request = (secret?: string) =>
  new Request("https://gavel.example/api/internal/orphan-credit-cleanup", {
    headers: secret ? { authorization: `Bearer ${secret}` } : undefined,
  });

beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("CRON_SECRET", key);
  rpc.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

it("blocks previews and unauthorized requests before the service client", async () => {
  expect((await GET(request())).status).toBe(401);
  vi.stubEnv("VERCEL_ENV", "preview");
  expect((await GET(request(key))).status).toBe(404);
  expect(rpc).not.toHaveBeenCalled();
});

it("runs one service-only batch and returns no profile details", async () => {
  rpc.mockResolvedValue({
    data: { ok: true, deleted: 2, busy: false },
    error: null,
  });
  const response = await GET(request(key));
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ ok: true, deleted: 2, busy: false });
  expect(rpc).toHaveBeenCalledExactlyOnceWith("sweep_orphan_guest_credits", {
    p_limit: 100,
  });
});

it("reports a missed sweep and avoids returning private database diagnostics", async () => {
  rpc.mockResolvedValueOnce({
    data: { ok: true, deleted: 0, busy: true },
    error: null,
  });
  expect((await GET(request(key))).status).toBe(503);
  rpc.mockResolvedValueOnce({
    data: null,
    error: { message: "private details" },
  });
  const failure = await GET(request(key));
  expect(failure.status).toBe(503);
  expect(await failure.json()).toEqual({ ok: false });
});
