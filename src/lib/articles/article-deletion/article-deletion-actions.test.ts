import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/lib/auth/access/access", () => ({ getCurrentAccess: m.access }));
vi.mock("@/lib/supabase/server/server", () => ({
  createServerSupabaseClient: async () => ({ rpc: m.rpc }),
}));
import { deleteArticleAction } from "./article-deletion-actions";
const id = "84000000-0000-4000-8000-000000000002";
const command = {
  articleId: id,
  expectedVersion: 1,
  requestId: "84000000-0000-4000-8000-000000000003",
  confirm: true as const,
};
describe("deletion action", () => {
  beforeEach(() => vi.clearAllMocks());
  it("rejects an author before touching the database", async () => {
    m.access.mockResolvedValue({ status: "active", role: "author" });
    expect(await deleteArticleAction(command)).toEqual({
      ok: false,
      code: "forbidden",
    });
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("validates a successful administrator response", async () => {
    m.access.mockResolvedValue({ status: "active", role: "administrator" });
    m.rpc.mockResolvedValue({
      data: { ok: true, articleId: id, replayed: false },
      error: null,
    });
    expect(await deleteArticleAction(command)).toEqual({
      ok: true,
      articleId: id,
      replayed: false,
    });
  });
  it("does not leak database errors", async () => {
    m.access.mockResolvedValue({ status: "active", role: "administrator" });
    m.rpc.mockResolvedValue({ data: null, error: { message: "private" } });
    expect(await deleteArticleAction(command)).toEqual({
      ok: false,
      code: "unavailable",
    });
  });
});
