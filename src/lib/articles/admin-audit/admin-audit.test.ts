import { beforeEach, expect, it, vi } from "vitest";
import {
  access,
  articleId,
  profileId,
  queryTestClient,
  updatedAt,
} from "../draft-queries/draft-query-test-client";

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
import { listAuditEvents } from "./admin-audit";

let http: ReturnType<typeof queryTestClient>;
const row = {
  event_id: articleId,
  action: "article.archived",
  resource_id: profileId,
  created_at: updatedAt,
  actor_label: "Editor",
};
beforeEach(() => {
  vi.clearAllMocks();
  http = queryTestClient();
  mocks.client.mockResolvedValue(http.client);
  mocks.guard.mockResolvedValue({ ...access, role: "administrator" });
});

it("returns safe summaries and a filter-bound keyset cursor", async () => {
  http.respond([row, { ...row, event_id: profileId }]);
  const page = await listAuditEvents({
    action: "article.archived",
    pageSize: 1,
  });
  expect(page.items).toEqual([
    {
      id: articleId,
      action: "article.archived",
      resourceId: profileId,
      createdAt: updatedAt,
      actorLabel: "Editor",
    },
  ]);
  expect(page.nextCursor).toEqual(expect.any(String));
  const url = new URL(String(http.network.mock.calls[0][0]));
  expect(url.pathname).toContain("/rpc/list_article_audit_events");
  expect(JSON.parse(String(http.network.mock.calls[0][1]?.body))).toMatchObject(
    {
      p_action: "article.archived",
      p_limit: 2,
    },
  );
  http.respond([]);
  await listAuditEvents({
    action: "article.archived",
    cursor: page.nextCursor,
  });
  expect(JSON.parse(String(http.network.mock.calls[1][1]?.body))).toMatchObject(
    {
      p_before_at: updatedAt,
      p_before_id: articleId,
    },
  );
  await expect(listAuditEvents({ cursor: page.nextCursor })).rejects.toThrow(
    "Invalid audit request.",
  );
});

it("rejects malformed or unbounded requests before access or database reads", async () => {
  for (const input of [
    { pageSize: 51 },
    { action: "article.deleted" },
    { cursor: "bad" },
    { actorId: articleId },
    { pageSize: "50" },
  ])
    await expect(listAuditEvents(input)).rejects.toThrow(
      "Invalid audit request.",
    );
  expect(mocks.guard).not.toHaveBeenCalled();
  expect(http.network).not.toHaveBeenCalled();
});

it("blocks authors before the RPC and masks database failures", async () => {
  mocks.guard.mockResolvedValue(access);
  await expect(listAuditEvents({})).rejects.toThrow(
    "Administrator access required.",
  );
  expect(http.network).not.toHaveBeenCalled();
  mocks.guard.mockResolvedValue({ ...access, role: "administrator" });
  http.respond({ message: "private SQL detail" }, 500);
  await expect(listAuditEvents({})).rejects.toThrow(
    "Unable to load article activity.",
  );
});

it("rejects raw or unexpected database fields in displayed events", async () => {
  http.respond([{ ...row, action: "article.deleted" }]);
  await expect(listAuditEvents({})).rejects.toThrow(
    "Unable to load article activity.",
  );
  http.respond([{ ...row, actor_label: "" }]);
  await expect(listAuditEvents({})).rejects.toThrow(
    "Unable to load article activity.",
  );
});
