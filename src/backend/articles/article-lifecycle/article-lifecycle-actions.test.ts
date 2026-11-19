import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  rpc: vi.fn(),
  client: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/backend/auth/access/access", () => ({ getCurrentAccess: m.access }));
vi.mock("@/backend/infrastructure/supabase/server/server", () => ({
  createServerSupabaseClient: m.client,
}));
import {
  restoreArticleAction,
  returnArticleAction,
  submitArticleAction,
} from "./article-lifecycle-actions";

const command = {
  articleId: "00000000-0000-4000-8000-000000000001",
  expectedVersion: 1,
  requestId: "00000000-0000-4000-8000-000000000002",
};
beforeEach(() => {
  vi.resetAllMocks();
  m.client.mockResolvedValue({ rpc: m.rpc });
  m.rpc.mockResolvedValue({ data: null, error: null });
});

describe("lifecycle actions", () => {
  it.each(["author", "editor"])(
    "refuses restore for %s before the database",
    async (role) => {
      m.access.mockResolvedValue({ status: "active", role });
      expect(await restoreArticleAction(command)).toEqual({
        ok: false,
        code: "forbidden",
      });
      expect(m.rpc).not.toHaveBeenCalled();
    },
  );
  it.each([
    ["signed out", { status: "signedOut" }],
    ["pending", { status: "pending" }],
  ])("refuses submit and return when %s", async (_l, access) => {
    m.access.mockResolvedValue(access);
    expect(await submitArticleAction(command)).toMatchObject({
      ok: false,
      code: "forbidden",
    });
    expect(
      await returnArticleAction({ ...command, note: "Fix the lede" }),
    ).toMatchObject({ ok: false, code: "forbidden" });
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("sends the note with a return and nothing else about authority", async () => {
    m.access.mockResolvedValue({ status: "active", role: "editor" });
    await returnArticleAction({ ...command, note: "Fix the lede" });
    expect(m.rpc).toHaveBeenCalledWith("return_article", {
      p_article_id: command.articleId,
      p_expected_version: 1,
      p_request_id: command.requestId,
      p_note: "Fix the lede",
    });
  });
});
