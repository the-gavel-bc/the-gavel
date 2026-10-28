import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
const load = vi.hoisted(() => vi.fn());
vi.mock("@/lib/articles/draft-category-action/draft-category-action", () => ({
  getDraftCategoriesAction: load,
}));
import { useDraftCategories } from "./use-draft-categories";
it("ignores stale section responses and permits retry after failure", async () => {
  const pending: ((value: unknown) => void)[] = [];
  load.mockImplementation(
    () => new Promise((resolve) => pending.push(resolve)),
  );
  const initial = [{ id: "old", name: "Old", sectionId: "a" }];
  const { result, rerender } = renderHook(
    ({ section }) => useDraftCategories(section, "a", initial),
    { initialProps: { section: "a" } },
  );
  expect(result.current.categories).toEqual(initial);
  expect(result.current.loading).toBe(false);
  rerender({ section: "b" });
  expect(result.current.loading).toBe(true);
  rerender({ section: "a" });
  await act(async () =>
    pending[0]({
      ok: true,
      categories: [{ id: "b", name: "Stale", sectionId: "b" }],
    }),
  );
  expect(result.current.categories).not.toContainEqual(
    expect.objectContaining({ id: "b" }),
  );
  await act(async () => pending[1]({ ok: false, code: "unavailable" }));
  expect(result.current.error).toBe(true);
  act(() => result.current.retry());
  await act(async () => pending[2]({ ok: true, categories: initial }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.categories).toEqual(initial);
});
it("adopts checked reload choices atomically even when the section is unchanged", () => {
  const original = [{ id: "old", name: "Old", sectionId: "a" }];
  const replacement = [{ id: "new", name: "New", sectionId: "a" }];
  const { result, rerender } = renderHook(
    ({ revision, categories }) =>
      useDraftCategories("a", "a", categories, revision),
    { initialProps: { revision: 0, categories: original } },
  );
  rerender({ revision: 1, categories: replacement });
  expect(result.current.categories).toEqual(replacement);
  expect(result.current.loading).toBe(false);
});
