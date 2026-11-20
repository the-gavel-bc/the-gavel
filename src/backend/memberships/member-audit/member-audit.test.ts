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
import {
  listMemberAudit,
  normalizeMemberAuditSearchParams,
} from "./member-audit";

let http: ReturnType<typeof queryTestClient>;
const row = {
  event_id: articleId,
  action: "membership.approved",
  resource_id: profileId,
  created_at: "2026-11-06T12:00:00Z",
  actor_label: "Administrator",
  target_email: "new@bc.edu",
  detail: { role: "author" },
};
beforeEach(() => {
  vi.clearAllMocks();
  http = queryTestClient();
  mocks.client.mockResolvedValue(http.client);
  mocks.guard.mockResolvedValue({ ...access, role: "administrator" });
});

it("returns safe membership events with a bounded cursor", async () => {
  http.respond([row, { ...row, event_id: profileId }]);
  const page = await listMemberAudit({ pageSize: 1 });
  expect(page.items).toEqual([
    {
      id: articleId,
      action: "membership.approved",
      targetUserId: profileId,
      targetEmail: "new@bc.edu",
      createdAt: row.created_at,
      actorLabel: "Administrator",
      detail: { role: "author" },
    },
  ]);
  expect(page.nextCursor).toEqual(expect.any(String));
  expect(new URL(String(http.network.mock.calls[0][0])).pathname).toContain(
    "/rpc/list_membership_audit_events_v2",
  );
  http.respond([]);
  await listMemberAudit({ cursor: page.nextCursor });
  expect(JSON.parse(String(http.network.mock.calls[1][1]?.body))).toMatchObject(
    {
      p_before_id: articleId,
      p_before_at: row.created_at,
    },
  );
});

it("ignores unknown and repeated activity query parameters safely", () => {
  expect(
    normalizeMemberAuditSearchParams({
      user: [profileId, profileId],
      cursor: ["cursor"],
      extra: "ignored",
    }),
  ).toEqual({ user: "__invalid__", cursor: "cursor" });
});

it("returns validated prior and new roles, including the reactivation action", async () => {
  http.respond([
    {
      ...row,
      action: "membership.role_changed",
      detail: { previousRole: "author", newRole: "editor" },
    },
    {
      ...row,
      event_id: profileId,
      action: "membership.reactivated",
      detail: { previousRole: "editor", newRole: "administrator" },
    },
  ]);
  expect((await listMemberAudit({})).items).toEqual([
    {
      id: articleId,
      action: "membership.role_changed",
      targetUserId: profileId,
      targetEmail: "new@bc.edu",
      createdAt: row.created_at,
      actorLabel: "Administrator",
      detail: { previousRole: "author", newRole: "editor" },
    },
    {
      id: profileId,
      action: "membership.reactivated",
      targetUserId: profileId,
      targetEmail: "new@bc.edu",
      createdAt: row.created_at,
      actorLabel: "Administrator",
      detail: { previousRole: "editor", newRole: "administrator" },
    },
  ]);
});

it("rejects malformed requests and authors before querying", async () => {
  for (const input of [{ cursor: "bad" }, { pageSize: 51 }, { raw: true }])
    await expect(listMemberAudit(input)).rejects.toThrow(
      "Invalid membership audit request.",
    );
  expect(mocks.guard).not.toHaveBeenCalled();
  mocks.guard.mockResolvedValue(access);
  await expect(listMemberAudit({})).rejects.toThrow(
    "Administrator access required.",
  );
  expect(http.network).not.toHaveBeenCalled();
});

it("masks database errors and unexpected actions", async () => {
  http.respond({ message: "private audit table" }, 500);
  await expect(listMemberAudit({})).rejects.toThrow(
    "Unable to load membership activity.",
  );
  http.respond([{ ...row, action: "article.published" }]);
  await expect(listMemberAudit({})).rejects.toThrow(
    "Unable to load membership activity.",
  );
  http.respond([{ ...row, detail: { role: "owner" } }]);
  await expect(listMemberAudit({})).rejects.toThrow(
    "Unable to load membership activity.",
  );
});

it("narrows activity to one person", async () => {
  http.respond([]);
  await listMemberAudit({ user: articleId });
  const calls = http.network.mock.calls;
  expect(JSON.parse(String(calls.at(-1)?.[1]?.body))).toMatchObject({
    p_subject: articleId,
  });
  await expect(listMemberAudit({ user: "not-a-uuid" })).rejects.toThrow(
    "Invalid membership audit request.",
  );
});
