import { beforeEach, expect, it, vi } from "vitest";
import {
  access,
  queryTestClient,
} from "@/lib/articles/draft-queries/draft-query-test-client";
const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  client: vi.fn(),
  connection: vi.fn(),
}));
vi.mock("@/lib/auth/access/access", () => ({
  requireActiveMembership: mocks.guard,
}));
vi.mock("@/lib/supabase/server/server", () => ({
  createServerSupabaseClient: mocks.client,
}));
vi.mock("next/server", () => ({ connection: mocks.connection }));
import { getOwnProfile } from "./own-profile";
let http: ReturnType<typeof queryTestClient>;
beforeEach(() => {
  vi.clearAllMocks();
  http = queryTestClient();
  mocks.client.mockResolvedValue(http.client);
  mocks.guard.mockResolvedValue(access);
});
it("loads only the own-profile RPC projection", async () => {
  http.respond([
    {
      display_name: "Writer",
      slug: "writer",
      biography: null,
      edit_version: 1,
      slug_frozen: false,
    },
  ]);
  expect(await getOwnProfile()).toEqual({
    displayName: "Writer",
    slug: "writer",
    biography: null,
    version: 1,
    slugFrozen: false,
  });
  expect(new URL(String(http.network.mock.calls[0][0])).pathname).toContain(
    "/rpc/get_own_public_profile",
  );
});
it("masks failures and rejects multiple rows", async () => {
  http.respond({ message: "private SQL" }, 500);
  await expect(getOwnProfile()).rejects.toThrow("Unable to load your profile.");
  http.respond([]);
  await expect(getOwnProfile()).rejects.toThrow("Unable to load your profile.");
});
