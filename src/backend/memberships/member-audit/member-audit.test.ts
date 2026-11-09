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
import { listMemberAudit } from "./member-audit";

let http: ReturnType<typeof queryTestClient>;
const row = {
  event_id: articleId,
  action: "membership.approved",
  resource_id: profileId,
  created_at: "2026-11-06T12:00:00Z",
  actor_label: "Administrator",
  target_email: "new@bc.edu",
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
    },
  ]);
  expect(page.nextCursor).toEqual(expect.any(String));
  expect(new URL(String(http.network.mock.calls[0][0])).pathname).toContain(
    "/rpc/list_membership_audit_events",
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
});
