import { beforeEach, expect, it, vi } from "vitest";

const cache = vi.hoisted(() => ({
  wrap: vi.fn(),
  update: vi.fn(),
}));
vi.mock("next/cache", () => ({
  unstable_cache: cache.wrap,
  updateTag: cache.update,
}));

import {
  cachePublicShellRead,
  invalidatePublicShell,
  PUBLIC_SHELL_TAG,
} from "./public-shell-cache";

const read = vi.fn();
const cachedRead = vi.fn();
const available = { kind: "ok", cards: [] };
const unavailable = { kind: "unavailable" } as const;

beforeEach(() => {
  vi.resetAllMocks();
  cache.wrap.mockReturnValue(cachedRead);
  read.mockResolvedValue(available);
});

it("serves a fresh shared value without calling the uncached reader", async () => {
  cachedRead.mockResolvedValue({ at: Date.now(), data: available });
  expect(await cachePublicShellRead("footer", read)()).toEqual(available);
  expect(cache.wrap).toHaveBeenCalledWith(
    expect.any(Function),
    ["public-shell", "footer"],
    {
      tags: [PUBLIC_SHELL_TAG],
      revalidate: 60,
    },
  );
  expect(read).not.toHaveBeenCalled();
});

it("reads through after a stale entry or cache outage", async () => {
  cachedRead
    .mockResolvedValueOnce({ at: Date.now() - 60_001, data: available })
    .mockRejectedValueOnce(new Error("cache unavailable"));
  read.mockResolvedValue(unavailable);
  const load = cachePublicShellRead("footer", read);
  expect(await load()).toEqual(unavailable);
  expect(await load()).toEqual(unavailable);
  expect(read).toHaveBeenCalledTimes(2);
});

it("returns an outage without storing it or repeating the database read", async () => {
  read.mockResolvedValue(unavailable);
  cachedRead.mockImplementation(() => cache.wrap.mock.calls[0][0]());
  expect(await cachePublicShellRead("footer", read)()).toEqual(unavailable);
  expect(read).toHaveBeenCalledOnce();
});

it("expires the public shell after a confirmed change", () => {
  invalidatePublicShell();
  expect(cache.update).toHaveBeenCalledWith(PUBLIC_SHELL_TAG);
});
