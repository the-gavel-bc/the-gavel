import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  action: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/backend/homepage/homepage-curation/homepage-actions", () => ({
  saveHomepageAction: mocks.action,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }),
}));
import { HomepageEditor } from "./homepage-editor";
const id = (n: number) =>
  `83000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const row = (n: number) => ({
  id: id(n),
  title: `Story ${n}`,
  slug: `story-${n}`,
  status: "published" as const,
  version: 1,
  updatedAt: "2026-01-01T00:00:00Z",
  publishedAt: "2026-01-01T00:00:00Z",
  archivedAt: null,
  ownerName: "Writer",
  sectionName: "News",
});
const curation = {
  version: 1,
  saved: { lead: null, featured: [], readThis: [] },
  effective: { lead: null, featured: [], readThis: [] },
};
const candidates = { items: [row(1), row(2)], nextCursor: null };
beforeEach(() => vi.clearAllMocks());
it("orders selections and retains exact retry through a later denial", async () => {
  mocks.action
    .mockResolvedValueOnce({ ok: false, code: "unavailable" })
    .mockResolvedValueOnce({ ok: false, code: "forbidden" })
    .mockResolvedValueOnce({
      ok: true,
      version: 2,
      changed: true,
      replayed: true,
    });
  render(
    <HomepageEditor curation={curation} candidates={candidates} search="" />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Add Story 1 to Featured News" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Add Story 2 to Featured News" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Move Story 2 up in Featured News" }),
  );
  const dirty = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(dirty);
  expect(dirty.defaultPrevented).toBe(true);
  await userEvent.click(
    screen.getByRole("button", { name: "Save homepage selections" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Retry original request" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Retry original request" }),
  );
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  await waitFor(() => {
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
  });
  expect(mocks.action.mock.calls[0][0].featured).toEqual([id(2), id(1)]);
  expect(mocks.action.mock.calls[1][0]).toEqual(mocks.action.mock.calls[0][0]);
  expect(mocks.action.mock.calls[2][0]).toEqual(mocks.action.mock.calls[0][0]);
});
it("retains choices when a stale save conflicts", async () => {
  mocks.action.mockResolvedValue({ ok: false, code: "conflict" });
  render(
    <HomepageEditor curation={curation} candidates={candidates} search="" />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Set Story 1 as lead" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Save homepage selections" }),
  );
  expect(
    await screen.findByRole("button", { name: "Reload selections" }),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Remove lead" })).toBeVisible();
});
it("keeps staged choices when the published catalog page changes", async () => {
  const { rerender } = render(
    <HomepageEditor curation={curation} candidates={candidates} search="" />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Set Story 1 as lead" }),
  );
  rerender(
    <HomepageEditor
      curation={curation}
      candidates={{ items: [row(3)], nextCursor: null }}
      search=""
    />,
  );
  expect(screen.getByRole("button", { name: "Remove lead" })).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Add Story 3 to Read This" }),
  );
  expect(
    screen.getByRole("button", { name: "Remove Story 3 from Read This" }),
  ).toBeVisible();
});
it("requires archived selections to be removed before saving", async () => {
  const archived = {
    id: id(1),
    title: "Archived story",
    status: "archived" as const,
  };
  render(
    <HomepageEditor
      curation={{ ...curation, saved: { ...curation.saved, lead: archived } }}
      candidates={candidates}
      search=""
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Save homepage selections" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    /Remove archived selections/,
  );
  expect(mocks.action).not.toHaveBeenCalled();
});
