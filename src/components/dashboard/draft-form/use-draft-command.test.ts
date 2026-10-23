import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { baseDraft } from "@/lib/articles/draft-contract/draft-test-cases";
const actions = vi.hoisted(() => ({ create: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/articles/draft-actions/draft-actions", () => ({
  createDraftAction: actions.create,
  saveDraftAction: actions.save,
}));
import { useDraftCommand } from "./use-draft-command";
const success = {
  ok: true,
  articleId: baseDraft.sectionId,
  version: 1,
  updatedAt: "2026-10-23T12:00:00Z",
  replayed: false,
  changed: true,
};
beforeEach(() => {
  vi.clearAllMocks();
});
it("retries uncertainty with the exact submitted UUID/payload and retains input", async () => {
  actions.create
    .mockResolvedValueOnce({ ok: false, code: "unavailable" })
    .mockResolvedValueOnce({ ...success, replayed: true });
  const { result } = renderHook(() => useDraftCommand(baseDraft));
  await act(async () => {
    await result.current.submit();
  });
  expect(result.current.locked).toBe(true);
  expect(result.current.phase).toBe("uncertain");
  act(() =>
    result.current.update({
      ...baseDraft,
      title: "Changed during uncertainty",
    }),
  );
  expect(result.current.draft.title).toBe(baseDraft.title);
  await act(async () => {
    expect(await result.current.submit()).toBe(true);
  });
  expect(actions.create.mock.calls[1][0]).toEqual(
    actions.create.mock.calls[0][0],
  );
  expect(result.current.phase).toBe("saved");
});
it("uses a fresh UUID after a definitive rejection and preserves edited input", async () => {
  actions.create.mockResolvedValue({ ok: false, code: "slug_conflict" });
  const { result } = renderHook(() => useDraftCommand(baseDraft));
  await act(async () => {
    await result.current.submit();
  });
  expect(result.current.fieldErrors.slug).toContain("already in use");
  act(() => result.current.update({ ...baseDraft, slug: "different-slug" }));
  await act(async () => {
    await result.current.submit();
  });
  expect(actions.create.mock.calls[1][0].requestId).not.toBe(
    actions.create.mock.calls[0][0].requestId,
  );
  expect(result.current.draft.slug).toBe("different-slug");
});
it("blocks duplicate in-flight submits and input changes", async () => {
  let finish!: (value: typeof success) => void;
  actions.create.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const { result } = renderHook(() => useDraftCommand(baseDraft));
  let first!: Promise<boolean>;
  act(() => {
    first = result.current.submit();
  });
  await act(async () => {
    expect(await result.current.submit()).toBe(false);
  });
  act(() => result.current.update({ ...baseDraft, title: "New input" }));
  expect(result.current.draft.title).toBe(baseDraft.title);
  expect(actions.create).toHaveBeenCalledOnce();
  await act(async () => {
    finish(success);
    await first;
  });
});
it("validates before transport and treats thrown transport errors as uncertain", async () => {
  const { result } = renderHook(() =>
    useDraftCommand({ ...baseDraft, title: "" }),
  );
  await act(async () => {
    await result.current.submit();
  });
  expect(result.current.fieldErrors.title).toBeTruthy();
  expect(actions.create).not.toHaveBeenCalled();
  act(() => result.current.update(baseDraft));
  actions.create.mockRejectedValue(new Error("private network error"));
  await act(async () => {
    await result.current.submit();
  });
  expect(result.current.failure).toEqual({ ok: false, code: "unavailable" });
});
it("retains committed versions when the same form is used for edit mode", async () => {
  actions.save.mockResolvedValue({ ...success, version: 3 });
  const { result } = renderHook(() =>
    useDraftCommand(baseDraft, {
      id: success.articleId,
      version: 2,
      updatedAt: success.updatedAt,
    }),
  );
  act(() => result.current.update({ ...baseDraft, title: "Updated title" }));
  expect(result.current.dirty).toBe(true);
  await act(async () => {
    await result.current.submit();
  });
  expect(actions.save.mock.calls[0][0]).toMatchObject({
    articleId: success.articleId,
    expectedVersion: 2,
  });
  expect(result.current.dirty).toBe(false);
});
