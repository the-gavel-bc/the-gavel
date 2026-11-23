import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ search: vi.fn(), create: vi.fn() }));
vi.mock(
  "@/backend/contributors/guest-contributor/guest-contributor-actions",
  () => ({
    searchContributorsAction: mocks.search,
    createGuestContributorAction: mocks.create,
  }),
);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.search.mockResolvedValue({ ok: true, items: options });
});
import type { DraftContributor } from "@/shared/articles/draft-contract/draft-contract";
import { DraftContributorFields } from "./draft-contributor-fields";
const options = [{ id: "guest", displayName: "Guest", slug: "guest" }];
function Form() {
  const [value, onChange] = useState<DraftContributor[]>([
    { profileId: "missing", role: "creative", displayOrder: 7 },
  ]);
  return (
    <>
      <DraftContributorFields
        value={value}
        options={options}
        onChange={onChange}
      />
      <output aria-label="Selected credits">{JSON.stringify(value)}</output>
    </>
  );
}
it("repairs an unavailable credit, orders by position and renumbers on every change", async () => {
  render(<Form />);
  expect(screen.getByLabelText("Contributor 1")).toHaveValue(
    "Unavailable contributor",
  );
  await userEvent.clear(screen.getByLabelText("Contributor 1"));
  await userEvent.type(screen.getByLabelText("Contributor 1"), "Guest");
  await userEvent.click(
    await screen.findByRole("option", { name: "Guest (guest)" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Add contributor" }),
  );
  const blank = screen.getByRole("combobox", { name: "Contributor 2" });
  expect(blank).toHaveFocus();
  expect(blank).toHaveValue("");
  await userEvent.type(blank, "Guest");
  await userEvent.click(
    await screen.findByRole("option", { name: "Guest (guest)" }),
  );
  await userEvent.selectOptions(screen.getByLabelText("Role 2"), "editor");
  const credits = () =>
    JSON.parse(
      screen.getByRole("status", { name: "Selected credits" }).textContent!,
    );
  expect(credits()).toEqual([
    { profileId: "guest", role: "creative", displayOrder: 0 },
    { profileId: "guest", role: "editor", displayOrder: 1 },
  ]);
  // There is no display-order field; the top row is first.
  expect(screen.queryByLabelText(/Display order/)).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Move contributor 2 up" }),
  );
  expect(credits()).toEqual([
    { profileId: "guest", role: "creative", displayOrder: 1 },
    { profileId: "guest", role: "editor", displayOrder: 0 },
  ]);
  expect(screen.getByLabelText("Role 1")).toHaveValue("editor");
  expect(screen.getByRole("combobox", { name: "Contributor 1" })).toHaveFocus();
  expect(
    screen.getByText("Contributor moved to position 1."),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Move contributor 1 up" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Move contributor 2 down" }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole("button", { name: "Remove contributor 1" }),
  );
  expect(credits()).toEqual([
    { profileId: "guest", role: "creative", displayOrder: 0 },
  ]);
  expect(screen.getByRole("combobox", { name: "Contributor 1" })).toHaveFocus();
  expect(screen.getByText("Contributor 1 removed.")).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Remove contributor 1" }),
  );
  expect(screen.getByRole("button", { name: "Add contributor" })).toHaveFocus();
});
it("restores the selected contributor label when uncommitted text loses focus", async () => {
  render(<Form />);
  const field = screen.getByLabelText("Contributor 1");
  await userEvent.clear(field);
  await userEvent.type(field, "Different person");
  await userEvent.tab();
  expect(field).toHaveValue("Unavailable contributor");
  expect(screen.getByLabelText("Selected credits")).toHaveTextContent(
    '"profileId":"missing"',
  );
});
it("shows credits in stored display order and caps the list at 5", async () => {
  const many = Array.from({ length: 5 }, (_, i) => ({
    profileId: "guest",
    role: (["writer", "editor", "creative"] as const)[i % 3],
    displayOrder: 4 - i,
  }));
  render(
    <DraftContributorFields
      value={many}
      options={options}
      onChange={() => {}}
    />,
  );
  // The lowest stored order is shown first (the last credit here).
  expect(screen.getByLabelText("Role 1")).toHaveValue("editor");
  expect(screen.getByLabelText("Role 5")).toHaveValue("writer");
  expect(
    screen.getByRole("button", { name: "Add contributor" }),
  ).toBeDisabled();
});
it("allows removal with an empty catalog and caps addition at 5", () => {
  render(
    <DraftContributorFields
      value={Array.from({ length: 5 }, (_, i) => ({
        profileId: `missing-${i}`,
        role: "writer",
        displayOrder: 0,
      }))}
      options={[]}
      error="Repair credits"
      onChange={() => {}}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Add contributor" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Remove contributor 1" }),
  ).toBeEnabled();
  expect(
    screen.getByRole("group", { name: "Contributors" }),
  ).toHaveAccessibleDescription(/Repair credits/);
});

it("creates a guest with keyboard navigation and announces bounded results", async () => {
  mocks.search.mockResolvedValue({ ok: true, items: [] });
  mocks.create.mockResolvedValue({
    ok: true,
    id: "new",
    displayName: "New Person",
    slug: "new-person",
    created: true,
    replayed: false,
  });
  render(<Form />);
  const input = screen.getByRole("combobox", { name: "Contributor 1" });
  await userEvent.clear(input);
  await userEvent.type(input, "New Person");
  await screen.findByRole("option", {
    name: "Add 'New Person' as a one-off credit",
  });
  await userEvent.keyboard("{ArrowDown}{Enter}");
  expect(
    await screen.findByDisplayValue("New Person (new-person)"),
  ).toBeVisible();
  expect(mocks.create).toHaveBeenCalledWith({
    requestId: expect.any(String),
    displayName: "New Person",
  });
  expect(
    JSON.parse(
      screen.getByRole("status", { name: "Selected credits" }).textContent!,
    )[0],
  ).toMatchObject({ profileId: "new", role: "creative", displayOrder: 7 });
});
it("preserves exact request and name after an uncertain creation", async () => {
  mocks.search.mockResolvedValue({ ok: true, items: [] });
  mocks.create
    .mockResolvedValueOnce({ ok: false, code: "unavailable" })
    .mockResolvedValueOnce({
      ok: true,
      id: "new",
      displayName: "Retry Guest",
      slug: "retry-guest",
      created: true,
      replayed: true,
    });
  render(<Form />);
  const input = screen.getByRole("combobox", { name: "Contributor 1" });
  await userEvent.clear(input);
  await userEvent.type(input, "Retry Guest");
  await userEvent.click(
    await screen.findByRole("option", {
      name: "Add 'Retry Guest' as a one-off credit",
    }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(/retry/i);
  expect(input).toBeDisabled();
  await userEvent.click(
    screen.getByRole("button", { name: "Retry contributor creation" }),
  );
  expect(mocks.create.mock.calls[1][0]).toEqual(mocks.create.mock.calls[0][0]);
  expect(
    await screen.findByDisplayValue("Retry Guest (retry-guest)"),
  ).toBeVisible();
});
it("drops stale search results and closes with Escape", async () => {
  let resolveOld!: (value: unknown) => void;
  mocks.search.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  mocks.search.mockResolvedValue({
    ok: true,
    items: [{ id: "other", displayName: "Other", slug: "other" }],
  });
  render(<Form />);
  const input = screen.getByRole("combobox", { name: "Contributor 1" });
  await userEvent.clear(input);
  await userEvent.type(input, "Guest");
  await vi.waitFor(() => expect(mocks.search).toHaveBeenCalledWith("Guest"));
  await userEvent.clear(input);
  await userEvent.type(input, "Other");
  expect(
    await screen.findByRole("option", { name: "Other (other)" }),
  ).toBeVisible();
  resolveOld({ ok: true, items: options });
  await vi.waitFor(() =>
    expect(
      screen.queryByRole("option", { name: "Guest (guest)" }),
    ).not.toBeInTheDocument(),
  );
  await userEvent.keyboard("{Escape}");
  expect(input).toHaveAttribute("aria-expanded", "false");
});
it("keeps role edits when guest creation completes and allows adding without a catalog", async () => {
  let complete!: (value: unknown) => void;
  mocks.search.mockResolvedValue({ ok: true, items: [] });
  mocks.create.mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  render(<Form />);
  const input = screen.getByRole("combobox", { name: "Contributor 1" });
  await userEvent.clear(input);
  await userEvent.type(input, "Slow Guest");
  await userEvent.click(
    await screen.findByRole("option", {
      name: "Add 'Slow Guest' as a one-off credit",
    }),
  );
  await userEvent.selectOptions(screen.getByLabelText("Role 1"), "editor");
  complete({
    ok: true,
    id: "slow",
    displayName: "Slow Guest",
    slug: "slow-guest",
    created: true,
    replayed: false,
  });
  await screen.findByDisplayValue("Slow Guest (slow-guest)");
  expect(
    JSON.parse(
      screen.getByRole("status", { name: "Selected credits" }).textContent!,
    )[0],
  ).toMatchObject({ profileId: "slow", role: "editor", displayOrder: 7 });
});
it("creates a searchable blank credit when no profiles exist", async () => {
  render(
    <DraftContributorFields value={[]} options={[]} onChange={mocks.create} />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Add contributor" }),
  );
  expect(mocks.create.mock.lastCall?.[0]([])).toEqual([
    { profileId: "", role: "writer", displayOrder: 0 },
  ]);
});

it("keeps two credits whose creation results arrive in the same render", async () => {
  const finish: Array<(value: unknown) => void> = [];
  mocks.search.mockResolvedValue({ ok: true, items: [] });
  mocks.create.mockImplementation(
    () => new Promise((resolve) => finish.push(resolve)),
  );
  render(<Form />);
  await userEvent.clear(screen.getByLabelText("Contributor 1"));
  await userEvent.type(screen.getByLabelText("Contributor 1"), "First Writer");
  await userEvent.click(
    await screen.findByRole("option", {
      name: "Add 'First Writer' as a one-off credit",
    }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Add contributor" }),
  );
  await userEvent.type(screen.getByLabelText("Contributor 2"), "Second Writer");
  await userEvent.click(
    await screen.findByRole("option", {
      name: "Add 'Second Writer' as a one-off credit",
    }),
  );
  await act(async () => {
    finish[0]({
      ok: true,
      id: "first",
      displayName: "First Writer",
      slug: "first",
      created: true,
      replayed: false,
    });
    finish[1]({
      ok: true,
      id: "second",
      displayName: "Second Writer",
      slug: "second",
      created: true,
      replayed: false,
    });
  });
  const credits = JSON.parse(
    screen.getByRole("status", { name: "Selected credits" }).textContent!,
  );
  expect(credits.map((credit: DraftContributor) => credit.profileId)).toEqual([
    "first",
    "second",
  ]);
});

it("explains the open credit cap without selecting the rejected name", async () => {
  mocks.search.mockResolvedValue({ ok: true, items: [] });
  mocks.create.mockResolvedValueOnce({ ok: false, code: "conflict" });
  render(<Form />);
  const input = screen.getByRole("combobox", { name: "Contributor 1" });
  await userEvent.clear(input);
  await userEvent.type(input, "Another Person");
  await screen.findByRole("option", {
    name: "Add 'Another Person' as a one-off credit",
  });
  await userEvent.keyboard("{ArrowDown}{Enter}");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    /50 unattached one-off credits/,
  );
  expect(input).not.toHaveValue("Another Person (another-person)");
});
