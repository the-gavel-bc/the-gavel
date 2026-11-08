import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  access,
  articleId,
  queryTestClient,
  updatedAt,
} from "../draft-queries/draft-query-test-client";
import { baseDraft } from "../../../shared/articles/draft-contract/draft-test-cases";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  client: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/backend/auth/access/access", () => ({
  getCurrentAccess: mocks.access,
}));
vi.mock("@/backend/infrastructure/supabase/server/server", () => ({
  createServerSupabaseClient: mocks.client,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import {
  createDraftAction,
  saveDraftAction,
  savePublishedArticleAction,
} from "./draft-actions";
let http: ReturnType<typeof queryTestClient>;
const receipt = {
  ok: true,
  articleId,
  version: 3,
  updatedAt,
  replayed: true,
  changed: false,
};
const create = { requestId: articleId, draft: baseDraft };
const save = { ...create, articleId, expectedVersion: 2 };
beforeEach(() => {
  vi.clearAllMocks();
  http = queryTestClient();
  mocks.client.mockResolvedValue(http.client);
  mocks.access.mockResolvedValue(access);
  mocks.revalidate.mockReset();
});
for (const [name, action, command, args] of [
  [
    "create_article_draft",
    createDraftAction,
    create,
    { p_request_id: articleId, p_draft: baseDraft },
  ],
  [
    "save_article_draft",
    saveDraftAction,
    save,
    {
      p_article_id: articleId,
      p_expected_version: 2,
      p_request_id: articleId,
      p_draft: baseDraft,
    },
  ],
  [
    "save_published_article",
    savePublishedArticleAction,
    save,
    {
      p_article_id: articleId,
      p_expected_version: 2,
      p_request_id: articleId,
      p_draft: baseDraft,
    },
  ],
] as const)
  describe(name, () => {
    const invoke = (value: unknown = command) => action(value as never);
    it("uses one user-scoped RPC, the original request and only private revalidation", async () => {
      http.respond(receipt);
      expect(await invoke()).toEqual(receipt);
      expect(http.network).toHaveBeenCalledOnce();
      const [url, init] = http.network.mock.calls[0];
      expect(String(url)).toBe(`http://127.0.0.1:54321/rest/v1/rpc/${name}`);
      expect(JSON.parse(String(init?.body))).toEqual(args);
      expect(new Headers(init?.headers).get("apikey")).toBe("public-test-key");
      expect(mocks.access).toHaveBeenCalledOnce();
      expect(mocks.revalidate.mock.calls).toEqual([
        ["/dashboard"],
        [`/dashboard/articles/${articleId}`],
      ]);
    });
    it.each(["signedOut", "pending"])(
      "denies %s before the mutation",
      async (status) => {
        mocks.access.mockResolvedValue({ status });
        expect(await invoke()).toEqual({ ok: false, code: "forbidden" });
        expect(http.network).not.toHaveBeenCalled();
      },
    );
    it("rejects unknown command fields before auth or RPC", async () => {
      expect(await invoke({ ...command, ownerProfileId: articleId })).toEqual({
        ok: false,
        code: "invalid_input",
      });
      expect(mocks.access).not.toHaveBeenCalled();
      expect(http.network).not.toHaveBeenCalled();
    });
    it("preserves domain failures without revalidation", async () => {
      http.respond({ ok: false, code: "conflict" });
      expect(await invoke()).toEqual({ ok: false, code: "conflict" });
      expect(mocks.revalidate).not.toHaveBeenCalled();
    });
    it("maps an uncertain transport or malformed receipt to unavailable without retry", async () => {
      http.respond({ message: "private SQL body" }, 500);
      expect(await invoke()).toEqual({ ok: false, code: "unavailable" });
      expect(http.network).toHaveBeenCalledOnce();
      expect(mocks.revalidate).not.toHaveBeenCalled();
      http.respond({ ...receipt, secret: "private" });
      expect(await invoke()).toEqual({ ok: false, code: "unavailable" });
    });
    it("masks access lookup failure", async () => {
      mocks.access.mockRejectedValue(new Error("private lookup"));
      expect(await invoke()).toEqual({ ok: false, code: "unavailable" });
      expect(http.network).not.toHaveBeenCalled();
    });
    it("acknowledges a confirmed commit even when revalidation fails", async () => {
      http.respond(receipt);
      mocks.revalidate.mockImplementation(() => {
        throw new Error("private cache failure");
      });
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        expect(await invoke()).toEqual(receipt);
        expect(log).toHaveBeenCalledWith(
          "Draft committed; private revalidation failed.",
          { requestId: articleId },
        );
      } finally {
        log.mockRestore();
      }
    });
  });
