import { beforeEach, expect, it, vi } from "vitest";
import {
  access,
  articleId,
  profileId,
  queryTestClient,
} from "@/backend/articles/draft-queries/draft-query-test-client";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  client: vi.fn(),
  connection: vi.fn(),
}));
vi.mock("@/backend/auth/access/access", () => ({
  requireActiveMembership: mocks.guard,
}));
vi.mock("@/backend/infrastructure/supabase/server/server", () => ({
  createServerSupabaseClient: mocks.client,
}));
vi.mock("next/server", () => ({ connection: mocks.connection }));
import { listMembers } from "./member-directory";

let http: ReturnType<typeof queryTestClient>;
const pending = {
  user_id: articleId,
  email: "new@bc.edu",
  display_name: null,
  role: null,
  state: "pending",
  edit_version: null,
  eligible: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  http = queryTestClient();
  mocks.client.mockResolvedValue(http.client);
  mocks.guard.mockResolvedValue({ ...access, role: "administrator" });
});

it("returns bounded pending identities and a state-bound cursor", async () => {
  http.respond([pending, { ...pending, user_id: profileId }]);
  const page = await listMembers({ state: "pending", pageSize: 1 });
  expect(page.items).toEqual([
    {
      userId: articleId,
      email: "new@bc.edu",
      displayName: null,
      role: null,
      state: "pending",
      version: null,
      eligible: true,
    },
  ]);
  expect(page.nextCursor).toEqual(expect.any(String));
  const call = http.network.mock.calls[0];
  expect(new URL(String(call[0])).pathname).toContain(
    "/rpc/list_membership_candidates",
  );
  expect(JSON.parse(String(call[1]?.body))).toMatchObject({
    p_limit: 2,
    p_state: "pending",
  });
  http.respond([]);
  await listMembers({ state: "pending", cursor: page.nextCursor });
  expect(JSON.parse(String(http.network.mock.calls[1][1]?.body))).toMatchObject(
    {
      p_before_email: "new@bc.edu",
      p_before_user_id: articleId,
    },
  );
  await expect(
    listMembers({ state: "active", cursor: page.nextCursor }),
  ).rejects.toThrow("Invalid membership list request.");
});

it("rejects malformed filters and authors before any RPC", async () => {
  for (const input of [
    { state: "deleted" },
    { pageSize: 51 },
    { cursor: "bad" },
    { role: "administrator" },
  ])
    await expect(listMembers(input)).rejects.toThrow(
      "Invalid membership list request.",
    );
  expect(mocks.guard).not.toHaveBeenCalled();
  mocks.guard.mockResolvedValue(access);
  await expect(listMembers({})).rejects.toThrow(
    "Administrator access required.",
  );
  expect(http.network).not.toHaveBeenCalled();
});

it("masks database errors and malformed identity rows", async () => {
  http.respond({ message: "private Auth table" }, 500);
  await expect(listMembers({})).rejects.toThrow("Unable to load memberships.");
  http.respond([{ ...pending, state: "owner" }]);
  await expect(listMembers({})).rejects.toThrow("Unable to load memberships.");
});
