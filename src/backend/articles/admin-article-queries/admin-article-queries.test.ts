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
vi.mock("@/backend/auth/access/access", () => ({
  requireActiveMembership: mocks.guard,
}));
vi.mock("@/backend/infrastructure/supabase/server/server", () => ({
  createServerSupabaseClient: mocks.client,
}));
vi.mock("next/server", () => ({ connection: mocks.connection }));
import {
  encodeAdminArticleCursor,
  getAdminArticleDetail,
  getAdminArticlesPage,
  getHomepageLibraryPage,
} from "./admin-article-queries";

let http: ReturnType<typeof queryTestClient>;
const row = {
  id: articleId,
  title: "News story",
  status: "archived",
  slug: "news-story",
  edit_version: 3,
  updated_at: updatedAt,
  published_at: updatedAt,
  archived_at: updatedAt,
  owner: { display_name: "Writer" },
  section: { name: "News" },
};
beforeEach(() => {
  vi.clearAllMocks();
  http = queryTestClient();
  mocks.client.mockResolvedValue(http.client);
  mocks.guard.mockResolvedValue({ ...access, role: "administrator" });
});
it("reads only safe admin summaries with filter-bound keyset pagination", async () => {
  http.respond([row, { ...row, id: profileId }]);
  const result = await getAdminArticlesPage({
    status: "archived",
    search: "News",
    pageSize: 1,
  });
  expect(result.items[0]).toMatchObject({
    id: articleId,
    ownerName: "Writer",
    sectionName: "News",
    status: "archived",
    version: 3,
  });
  expect(result.nextCursor).toEqual(expect.any(String));
  const url = new URL(String(http.network.mock.calls[0][0]));
  expect(url.searchParams.get("status")).toBe("eq.archived");
  expect(url.searchParams.get("title")).toBe("imatch.News");
  expect(url.searchParams.get("select")).not.toMatch(
    /content|excerpt|auth_user_id/,
  );
  expect(url.searchParams.get("order")).toBe("updated_at.desc,id.desc");
  expect(url.searchParams.get("limit")).toBe("2");
  http.respond([]);
  expect(
    await getAdminArticlesPage({
      status: "archived",
      search: "News",
      cursor: result.nextCursor!,
    }),
  ).toEqual({ items: [], nextCursor: null });
  await expect(
    getAdminArticlesPage({
      status: "draft",
      search: "News",
      cursor: result.nextCursor!,
    }),
  ).rejects.toThrow("Invalid admin article request.");
});
it("rejects forged inputs and non-admin access before any article read", async () => {
  for (const input of [
    { pageSize: 51 },
    { status: "other" },
    { search: "a\u0000b" },
    { cursor: "invalid" },
    { owner: profileId },
  ])
    await expect(getAdminArticlesPage(input as never)).rejects.toThrow(
      "Invalid admin article request.",
    );
  mocks.guard.mockResolvedValue(access);
  await expect(getAdminArticlesPage({})).rejects.toThrow(
    "Administrator access required.",
  );
  await expect(getAdminArticleDetail(articleId)).rejects.toThrow(
    "Administrator access required.",
  );
  expect(http.network).not.toHaveBeenCalled();
});
it("loads a safe archived detail and masks missing or failed reads", async () => {
  http.respond(row);
  expect(await getAdminArticleDetail(articleId)).toMatchObject({
    id: articleId,
    status: "archived",
    ownerName: "Writer",
    version: 3,
  });
  const url = new URL(String(http.network.mock.calls[0][0]));
  expect(url.searchParams.get("select")).not.toMatch(
    /content|excerpt|auth_user_id/,
  );
  http.respond(null);
  expect(await getAdminArticleDetail(articleId)).toBeNull();
  http.respond({ message: "private SQL" }, 500);
  await expect(getAdminArticleDetail(articleId)).rejects.toThrow(
    "Unable to load article.",
  );
  await expect(getAdminArticleDetail("bad")).rejects.toThrow(
    "Invalid article ID.",
  );
});
it("rejects a cursor with changed search and preserves microseconds", async () => {
  const cursor = encodeAdminArticleCursor({
    id: articleId,
    updatedAt,
    status: "all",
    search: "News",
  });
  await expect(
    getAdminArticlesPage({ cursor, search: "Other" }),
  ).rejects.toThrow("Invalid admin article request.");
  http.respond([]);
  await getAdminArticlesPage({ cursor, search: "News" });
  const url = new URL(String(http.network.mock.calls[0][0]));
  expect(url.searchParams.get("or")).toContain(updatedAt);
});

it("uses the checked homepage RPC and binds the cursor to its search", async () => {
  const rows = Array.from({ length: 13 }, (_, index) => ({
    id: `80000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`,
    title: "Homepage item",
    updated_at: updatedAt,
  }));
  http.respond(rows);
  const page = await getHomepageLibraryPage({ search: "Campus%" });
  expect(page.items).toHaveLength(12);
  expect(page.nextCursor).toEqual(expect.any(String));
  expect(String(http.network.mock.calls[0][0])).toContain(
    "/rpc/list_homepage_eligible_stories",
  );
  expect(JSON.parse(String(http.network.mock.calls[0][1]?.body))).toEqual({
    p_limit: 13,
    p_search: "Campus%",
  });
  await expect(
    getHomepageLibraryPage({ search: "Other", cursor: page.nextCursor }),
  ).rejects.toThrow("Invalid homepage library request.");
  expect(http.network).toHaveBeenCalledTimes(1);

  http.respond([rows[12]]);
  const next = await getHomepageLibraryPage({
    search: "Campus%",
    cursor: page.nextCursor,
  });
  expect(next).toEqual({
    items: [{ id: rows[12].id, title: "Homepage item" }],
    nextCursor: null,
  });
  expect(JSON.parse(String(http.network.mock.calls[1][1]?.body))).toMatchObject(
    {
      p_before_id: rows[11].id,
      p_before_updated_at: updatedAt,
    },
  );
});
