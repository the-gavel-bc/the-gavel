import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { baseDraft } from "@/shared/articles/draft-contract/draft-test-cases";
const actions = vi.hoisted(() => ({
  create: vi.fn(),
  save: vi.fn(),
  published: vi.fn(),
}));
vi.mock("@/backend/articles/draft-actions/draft-actions", () => ({
  createDraftAction: actions.create,
  saveDraftAction: actions.save,
  savePublishedArticleAction: actions.published,
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
  expect(result.current.phase).toBe("uncertain");
  act(() =>
    result.current.update({
      ...baseDraft,
      title: "Changed during uncertainty",
    }),
  );
  expect(result.current.draft.title).toBe("Changed during uncertainty");
  await act(async () => {
    expect(await result.current.submit()).toMatchObject({
      id: success.articleId,
      version: 1,
    });
  });
  expect(actions.create.mock.calls[1][0]).toEqual(
    actions.create.mock.calls[0][0],
  );
  expect(result.current.phase).toBe("idle");
  expect(result.current.dirty).toBe(true);
});
it("uses a fresh UUID after a definitive rejection and preserves edited input", async () => {
  actions.create.mockResolvedValue({ ok: false, code: "slug_conflict" });
  const { result } = renderHook(() => useDraftCommand(baseDraft));
  await act(async () => {
    await result.current.submit();
  });
  expect(result.current.fieldErrors).toEqual({});
  act(() => result.current.update({ ...baseDraft, title: "Different title" }));
  await act(async () => {
    await result.current.submit();
  });
  expect(actions.create.mock.calls[1][0].requestId).not.toBe(
    actions.create.mock.calls[0][0].requestId,
  );
  expect(result.current.draft.title).toBe("Different title");
});
it("blocks duplicate in-flight submits while preserving new input", async () => {
  let finish!: (value: typeof success) => void;
  actions.create.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const { result } = renderHook(() => useDraftCommand(baseDraft));
  let first!: Promise<unknown>;
  act(() => {
    first = result.current.submit();
  });
  await act(async () => {
    expect(await result.current.submit()).toBeNull();
  });
  act(() => result.current.update({ ...baseDraft, title: "New input" }));
  expect(result.current.draft.title).toBe("New input");
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
it("routes published saves and exact retries through the published boundary", async () => {
  actions.published
    .mockResolvedValueOnce({ ok: false, code: "unavailable" })
    .mockResolvedValueOnce({ ...success, version: 3, replayed: true });
  const article = {
    id: success.articleId,
    version: 2,
    updatedAt: success.updatedAt,
  };
  const { result } = renderHook(() =>
    useDraftCommand(baseDraft, article, "published"),
  );
  act(() => result.current.update({ ...baseDraft, title: "Published update" }));
  await act(async () => {
    await result.current.submit();
  });
  expect(result.current.phase).toBe("uncertain");
  await act(async () => {
    await result.current.submit();
  });
  expect(actions.published.mock.calls[1][0]).toEqual(
    actions.published.mock.calls[0][0],
  );
  expect(actions.save).not.toHaveBeenCalled();
  expect(result.current.article?.version).toBe(3);
});
it("keeps an earlier uncertain command when later access denial cannot resolve it", async () => {
  actions.create
    .mockResolvedValueOnce({ ok: false, code: "unavailable" })
    .mockResolvedValueOnce({ ok: false, code: "forbidden" })
    .mockResolvedValueOnce({ ...success, replayed: true });
  const { result } = renderHook(() => useDraftCommand(baseDraft));
  await act(async () => {
    await result.current.submit();
  });
  await act(async () => {
    await result.current.submit();
  });
  expect(result.current.phase).toBe("uncertain");
  await act(async () => {
    expect(await result.current.submit()).toMatchObject({
      id: success.articleId,
      version: 1,
    });
  });
  expect(actions.create.mock.calls.map((call) => call[0])).toEqual(
    Array(3).fill(actions.create.mock.calls[0][0]),
  );
});
it("submits the latest input even before React renders the update", async () => {
  actions.create.mockResolvedValue(success);
  const { result } = renderHook(() => useDraftCommand(baseDraft));
  let saving!: Promise<unknown>;
  act(() => {
    const command = result.current;
    command.update({ ...baseDraft, title: "Latest native edit" });
    saving = command.submit();
  });
  await act(async () => {
    await saving;
  });
  expect(actions.create.mock.calls[0][0].draft.title).toBe(
    "Latest native edit",
  );
});
it("acknowledges canonical association ordering without a false unsaved warning", async () => {
  actions.save.mockResolvedValue(success);
  const { result } = renderHook(() =>
    useDraftCommand(
      {
        ...baseDraft,
        contributors: [
          { profileId: baseDraft.sectionId, role: "writer", displayOrder: 0 },
          { profileId: baseDraft.sectionId, role: "editor", displayOrder: 0 },
        ],
      },
      { id: baseDraft.sectionId, version: 1, updatedAt: success.updatedAt },
    ),
  );
  await act(async () => {
    await result.current.submit();
  });
  expect(result.current.dirty).toBe(false);
});

it("preserves newer input through a delayed success and saves it with the acknowledged version", async () => {
  let finish!: (value: typeof success) => void;
  actions.save
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue({ ...success, version: 3 });
  const { result } = renderHook(() =>
    useDraftCommand(baseDraft, {
      id: success.articleId,
      version: 1,
      updatedAt: success.updatedAt,
    }),
  );
  let saving!: Promise<unknown>;
  act(() => {
    result.current.update({ ...baseDraft, title: "First snapshot" });
    saving = result.current.submit();
  });
  act(() => result.current.update({ ...baseDraft, title: "Newest text" }));
  await act(async () => {
    finish({ ...success, version: 2 });
    await saving;
  });
  expect(result.current.draft.title).toBe("Newest text");
  expect(result.current.dirty).toBe(true);
  await act(async () => {
    await result.current.submit();
  });
  expect(actions.save.mock.calls[1][0]).toMatchObject({
    expectedVersion: 2,
    draft: { title: "Newest text" },
  });
  expect(result.current.dirty).toBe(false);
});

it("a captured image callback advances version without discarding current edits", async () => {
  const article = {
    id: baseDraft.sectionId,
    version: 1,
    updatedAt: success.updatedAt,
  };
  const { result } = renderHook(() => useDraftCommand(baseDraft, article));
  const completeImage = result.current.acknowledgeArticle;
  act(() => result.current.update({ ...baseDraft, title: "Newer title" }));
  act(() => completeImage({ ...article, version: 2 }));
  expect(result.current.draft.title).toBe("Newer title");
  expect(result.current.dirty).toBe(true);
  actions.save.mockResolvedValue({ ...success, version: 3 });
  await act(async () => {
    await result.current.submit();
  });
  expect(actions.save).toHaveBeenCalledWith(
    expect.objectContaining({
      expectedVersion: 2,
      draft: expect.objectContaining({ title: "Newer title" }),
    }),
  );
});

it("restores the published date after a confirmed clear and preserves newer edits", async () => {
  let finish!: (value: typeof success) => void;
  actions.published.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const { result } = renderHook(() =>
    useDraftCommand(
      { ...baseDraft, publicationDate: "2026-01-15" },
      { id: success.articleId, version: 2, updatedAt: success.updatedAt },
      "published",
    ),
  );
  act(() =>
    result.current.update((draft) => ({ ...draft, publicationDate: null })),
  );
  let saving!: Promise<unknown>;
  act(() => {
    saving = result.current.submit();
  });
  expect(actions.published.mock.lastCall?.[0].draft).not.toHaveProperty(
    "publicationDate",
  );
  act(() =>
    result.current.update((draft) => ({ ...draft, title: "Newer title" })),
  );
  await act(async () => {
    finish({ ...success, version: 2, changed: false });
    await saving;
  });
  expect(result.current.draft).toMatchObject({
    publicationDate: "2026-01-15",
    title: "Newer title",
  });
  expect(result.current.dirty).toBe(true);
});
