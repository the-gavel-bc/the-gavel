import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/backend/auth/access/access", () => ({
  getCurrentAccess: mocks.access,
}));
vi.mock("@/backend/infrastructure/supabase/server/server", () => ({
  createServerSupabaseClient: async () => ({ rpc: mocks.rpc }),
}));
import { saveArticleCorrectionAction } from "./article-correction-actions";

const command = {
  articleId: "00000000-0000-4000-8000-000000000001",
  requestId: "00000000-0000-4000-8000-000000000002",
  expectedCorrection: null,
  correction: "  The date was Nov. 3.  ",
};
const asEditor = () =>
  mocks.access.mockResolvedValue({ status: "active", role: "editor" });

describe("saveArticleCorrectionAction", () => {
  beforeEach(() => vi.clearAllMocks());
  it("denies authors without calling the database", async () => {
    mocks.access.mockResolvedValue({ status: "active", role: "author" });
    expect(await saveArticleCorrectionAction(command)).toEqual({
      ok: false,
      code: "forbidden",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(["<b>x</b>", "x".repeat(2001), "bad\u0007text", "a\u3164b"])(
    "refuses unsafe text %#",
    async (correction) => {
      asEditor();
      expect(
        await saveArticleCorrectionAction({ ...command, correction }),
      ).toEqual({ ok: false, code: "invalid_input" });
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );
  it("sends the expected and new text and refreshes the editor", async () => {
    asEditor();
    mocks.rpc.mockResolvedValue({
      data: { ok: true, changed: true, replayed: false },
      error: null,
    });
    expect(await saveArticleCorrectionAction(command)).toEqual({
      ok: true,
      changed: true,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("set_article_correction", {
      p_article_id: command.articleId,
      p_expected_correction: null,
      p_request_id: command.requestId,
      p_correction: command.correction,
    });
    expect(mocks.revalidate).toHaveBeenCalledWith(
      `/dashboard/articles/${command.articleId}`,
    );
  });
  it("passes database refusals through and hides failures", async () => {
    asEditor();
    mocks.rpc.mockResolvedValueOnce({
      data: { ok: false, code: "conflict" },
      error: null,
    });
    expect(await saveArticleCorrectionAction(command)).toEqual({
      ok: false,
      code: "conflict",
    });
    mocks.rpc.mockResolvedValueOnce({
      data: { ok: false, code: "something_new" },
      error: null,
    });
    expect(await saveArticleCorrectionAction(command)).toEqual({
      ok: false,
      code: "unavailable",
    });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "x" } });
    expect(await saveArticleCorrectionAction(command)).toEqual({
      ok: false,
      code: "unavailable",
    });
  });
});
