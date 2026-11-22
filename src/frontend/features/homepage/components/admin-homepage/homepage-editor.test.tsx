import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  list: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/backend/homepage/homepage-curation/homepage-actions", () => ({
  saveHomepageAction: mocks.save,
}));
vi.mock("@/backend/homepage/homepage-curation/homepage-stories-action", () => ({
  listHomepageStoriesAction: mocks.list,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
import { HomepageEditor } from "./homepage-editor";
import type { Choices, Story } from "./homepage-arrangement";
import type { LibraryPage } from "@/backend/homepage/homepage-curation/homepage-stories-action";

const id = (n: number) =>
  `83000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const story = (n: number, extra: Partial<Story> = {}): Story => ({
  id: id(n),
  title: `Story ${n}`,
  status: "published",
  imageUrl: null,
  ...extra,
});
const empty: Choices = { lead: null, featured: [], readThis: [] };
const library: LibraryPage = { items: [story(1), story(2)], nextCursor: null };
const renderEditor = (saved: Choices = empty, lib = library) =>
  render(<HomepageEditor version={1} saved={saved} library={lib} />);
beforeEach(() => vi.clearAllMocks());

it("orders selections with arrows and retains exact retry through a later denial", async () => {
  mocks.save
    .mockResolvedValueOnce({ ok: false, code: "unavailable" })
    .mockResolvedValueOnce({ ok: false, code: "forbidden" })
    .mockResolvedValueOnce({
      ok: true,
      version: 2,
      changed: true,
      replayed: true,
    });
  renderEditor();
  await userEvent.click(
    screen.getByRole("button", { name: "Add Story 1 to Featured News" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Add Story 2 to Featured News" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Move Story 2 left in Featured News" }),
  );
  expect(
    screen.getByRole("button", { name: "Move Story 2 left in Featured News" }),
  ).toBeDisabled();
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
  expect(mocks.save.mock.calls[0][0].featured).toEqual([id(2), id(1)]);
  expect(mocks.save.mock.calls[1][0]).toEqual(mocks.save.mock.calls[0][0]);
  expect(mocks.save.mock.calls[2][0]).toEqual(mocks.save.mock.calls[0][0]);
});

it("retains choices on a stale save and reloads only after an in-page confirmation", async () => {
  mocks.save.mockResolvedValue({ ok: false, code: "conflict" });
  renderEditor();
  await userEvent.click(
    screen.getByRole("button", { name: "Set Story 1 as lead" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Save homepage selections" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Reload selections" }),
  );
  expect(await screen.findByRole("alertdialog")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(screen.getByRole("button", { name: "Remove lead" })).toBeVisible();
});

it("pages the library with arrows, searches, and keeps staged choices", async () => {
  mocks.list
    .mockResolvedValueOnce({ ok: true, items: [story(3)], nextCursor: null })
    .mockResolvedValueOnce({ ok: true, items: [story(4)], nextCursor: null });
  renderEditor(empty, { items: [story(1)], nextCursor: "c1" });
  await userEvent.click(
    screen.getByRole("button", { name: "Set Story 1 as lead" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "More stories" }));
  expect(await screen.findByText("Story 3")).toBeVisible();
  expect(mocks.list).toHaveBeenCalledWith({ cursor: "c1" });
  expect(screen.getByRole("button", { name: "More stories" })).toBeDisabled();
  await userEvent.click(
    screen.getByRole("button", { name: "Previous stories" }),
  );
  expect(screen.getAllByText("Story 1").length).toBeGreaterThan(0);
  expect(mocks.list).toHaveBeenCalledTimes(1);
  await userEvent.type(screen.getByLabelText("Search titles"), "four");
  await userEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(await screen.findByText("Story 4")).toBeVisible();
  expect(mocks.list).toHaveBeenLastCalledWith({ search: "four" });
  expect(screen.getByRole("button", { name: "Remove lead" })).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Add Story 4 to Read This" }),
  );
  expect(
    screen.getByRole("button", { name: "Remove Story 4 from Read This" }),
  ).toBeVisible();
});

it("rejects unsafe search text before any request", async () => {
  renderEditor();
  const notice = screen.getByRole("alert");
  expect(notice).toBeEmptyDOMElement();
  await userEvent.type(screen.getByLabelText("Search titles"), "a<b");
  await userEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(notice).toHaveTextContent(/letters, numbers/);
  expect(mocks.list).not.toHaveBeenCalled();
});

it("requires archived selections to be removed before saving", async () => {
  renderEditor({
    ...empty,
    lead: story(1, { status: "archived", title: "Archived story" }),
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Add Story 2 to Featured News" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Save homepage selections" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    /Remove archived selections/,
  );
  expect(mocks.save).not.toHaveBeenCalled();
});

it("discards unsaved changes back to the saved arrangement", async () => {
  renderEditor({ ...empty, featured: [story(1)] });
  expect(
    screen.queryByRole("button", { name: "Discard" }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Remove Story 1 from Featured News" }),
  );
  expect(screen.getByText("Unsaved changes")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Discard" }));
  expect(
    screen.getByRole("button", { name: "Remove Story 1 from Featured News" }),
  ).toBeVisible();
});

const dataTransfer = () => ({ setData: vi.fn(), effectAllowed: "" });
it("drags a library story into a row and refuses a fifth story", async () => {
  renderEditor(
    { ...empty, featured: [story(11), story(12), story(13), story(14)] },
    { items: [story(1), story(2)], nextCursor: null },
  );
  const featured = screen.getByRole("region", { name: "Featured News" });
  const readThis = screen.getByRole("region", { name: "Read This" });
  const card = screen.getByText("Story 1", { selector: "p" }).closest("li")!;
  fireEvent.dragStart(card, { dataTransfer: dataTransfer() });
  fireEvent.drop(within(featured).getAllByRole("listitem")[0], {
    dataTransfer: dataTransfer(),
  });
  expect(screen.getByRole("alert")).toHaveTextContent("up to four");
  fireEvent.dragStart(card, { dataTransfer: dataTransfer() });
  fireEvent.drop(within(readThis).getAllByRole("listitem").at(-1)!, {
    dataTransfer: dataTransfer(),
  });
  expect(within(readThis).getByText("Story 1")).toBeVisible();
});

it("drags a row story onto the lead, swapping the old lead into its slot", () => {
  renderEditor({
    lead: story(9),
    featured: [story(1), story(2)],
    readThis: [],
  });
  const lead = screen.getByRole("region", { name: "Lead story" });
  const featured = screen.getByRole("region", { name: "Featured News" });
  const dragged = within(featured).getByText("Story 2").closest("li")!;
  fireEvent.dragStart(dragged, { dataTransfer: dataTransfer() });
  fireEvent.drop(within(lead).getByRole("listitem"), {
    dataTransfer: dataTransfer(),
  });
  expect(within(lead).getByText("Story 2")).toBeVisible();
  expect(within(featured).getByText("Story 9")).toBeVisible();
});
