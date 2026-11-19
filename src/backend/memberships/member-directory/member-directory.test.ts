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
const row = {
  key: articleId,
  user_id: null,
  invitation_id: articleId,
  email: "new@bc.edu",
  display_name: null,
  role: "author",
  state: "invited",
  edit_version: 1,
  eligible: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  http = queryTestClient();
  mocks.client.mockResolvedValue(http.client);
  mocks.guard.mockResolvedValue({ ...access, role: "administrator" });
});

it("returns a bounded page of staff and a cursor for the next one", async () => {
  http.respond([row, { ...row, key: profileId, email: "z@bc.edu" }]);
  const page = await listMembers({ state: "invited", pageSize: 1, q: " new " });
  expect(page.items).toEqual([
    {
      key: articleId,
      userId: null,
      invitationId: articleId,
      email: "new@bc.edu",
      displayName: null,
      role: "author",
      state: "invited",
      version: 1,
      eligible: true,
    },
  ]);
  expect(page.nextCursor).toEqual(expect.any(String));
  const call = http.network.mock.calls[0];
  expect(new URL(String(call[0])).pathname).toContain("/rpc/list_staff");
  expect(JSON.parse(String(call[1]?.body))).toMatchObject({
    p_limit: 2,
    p_state: "invited",
    p_search: "new",
  });
  http.respond([]);
  await listMembers({ state: "invited", cursor: page.nextCursor });
  expect(JSON.parse(String(http.network.mock.calls[1][1]?.body))).toMatchObject(
    { p_after_email: "new@bc.edu", p_after_key: articleId },
  );
});

it("rejects malformed filters and authors before any RPC", async () => {
  for (const input of [
    { state: "pending" },
    { pageSize: 51 },
    { cursor: "bad" },
    { role: "owner" },
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
  http.respond([{ ...row, state: "owner" }]);
  await expect(listMembers({})).rejects.toThrow("Unable to load memberships.");
});
