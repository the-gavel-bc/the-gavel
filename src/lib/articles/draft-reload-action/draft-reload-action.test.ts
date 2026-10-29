import { beforeEach, expect, it, vi } from "vitest";
import { baseDraft } from "../draft-contract/draft-test-cases";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  detail: vi.fn(),
  options: vi.fn(),
}));
vi.mock("@/lib/auth/access/access", () => ({ getCurrentAccess: mocks.access }));
vi.mock("../draft-queries/draft-queries", () => ({
  getDraftDetail: mocks.detail,
  getDraftOptions: mocks.options,
}));
import { reviewDraftAction } from "./draft-reload-action";
const detail = {
  kind: "editable",
  articleId: baseDraft.sectionId,
  version: 2,
  updatedAt: "2026-10-28T12:00:00Z",
  draft: baseDraft,
  unavailableSelections: {
    sectionId: null,
    categoryIds: [],
    tagIds: [],
    contributorIds: [],
  },
};
const options = { sections: [], categories: [], tags: [], contributors: [] };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({ status: "active" });
  mocks.detail.mockResolvedValue(detail);
  mocks.options.mockResolvedValue(options);
});
it("checks current access and rejects malformed IDs before reading private records", async () => {
  expect(await reviewDraftAction("bad")).toEqual({
    ok: false,
    code: "invalid_input",
  });
  mocks.access.mockResolvedValue({ status: "pending" });
  expect(await reviewDraftAction(baseDraft.sectionId)).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(mocks.detail).not.toHaveBeenCalled();
});
it("returns checked private detail and eligible choices", async () => {
  expect(await reviewDraftAction(baseDraft.sectionId)).toEqual({
    ok: true,
    detail,
    options,
  });
  expect(mocks.detail).toHaveBeenCalledWith(baseDraft.sectionId);
  expect(mocks.options).toHaveBeenCalledWith(baseDraft.sectionId);
});
it.each([
  { kind: "notFound" },
  { kind: "readOnly", status: "published" },
  { kind: "unsupportedContent" },
])("preserves non-editable $kind without returning catalogs", async (value) => {
  mocks.detail.mockResolvedValue(value);
  expect(await reviewDraftAction(baseDraft.sectionId)).toEqual({
    ok: true,
    detail: value,
    options: null,
  });
  expect(mocks.options).not.toHaveBeenCalled();
});
it("keeps read failures and access loss safe without navigating the editor away", async () => {
  mocks.detail.mockRejectedValue(new Error("private SQL or access redirect"));
  expect(await reviewDraftAction(baseDraft.sectionId)).toEqual({
    ok: false,
    code: "unavailable",
  });
});
