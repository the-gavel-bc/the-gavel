import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ action: vi.fn(), refresh: vi.fn() }));
vi.mock("@/backend/memberships/invitation-command/invitation-actions", () => ({
  manageInvitationAction: mocks.action,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
import { AddPeopleForm } from "./add-people-form";

beforeEach(() => vi.clearAllMocks());

it("confirms administrator grants and reports unchanged listed addresses", async () => {
  mocks.action.mockResolvedValue({
    ok: true,
    added: 0,
    updated: 0,
    skipped: ["listed@bc.edu"],
  });
  render(<AddPeopleForm />);
  await userEvent.type(
    screen.getByLabelText("BC email addresses"),
    "Listed Person <listed@bc.edu>",
  );
  await userEvent.selectOptions(
    screen.getByLabelText(/Role for everyone/),
    "administrator",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Add to staff list" }),
  );
  expect(
    await screen.findByRole("alertdialog", {
      name: "Grant Administrator access?",
    }),
  ).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(mocks.action).not.toHaveBeenCalled();
  expect(screen.getByLabelText("BC email addresses")).toHaveValue(
    "Listed Person <listed@bc.edu>",
  );

  await userEvent.click(
    screen.getByRole("button", { name: "Add to staff list" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Grant access" }),
  );
  await waitFor(() => expect(mocks.action).toHaveBeenCalledOnce());
  expect(mocks.action.mock.calls[0][0]).toMatchObject({
    kind: "invite",
    entries: [
      {
        email: "listed@bc.edu",
        displayName: "Listed Person",
        role: "administrator",
      },
    ],
  });
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Already listed or members",
  );
});

it("keeps an uncertain request available for exact retry and recovers the form", async () => {
  mocks.action
    .mockResolvedValueOnce({ ok: false, code: "unavailable" })
    .mockResolvedValueOnce({
      ok: true,
      added: 1,
      updated: 0,
      skipped: [],
    });
  render(<AddPeopleForm />);
  await userEvent.type(
    screen.getByLabelText("BC email addresses"),
    "One Person <one@bc.edu>",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Add to staff list" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Retry original request" }),
  );
  await waitFor(() => expect(mocks.action).toHaveBeenCalledTimes(2));
  expect(mocks.action.mock.calls[1][0]).toEqual(mocks.action.mock.calls[0][0]);
  expect(screen.getByLabelText("BC email addresses")).toHaveValue("");
  expect(mocks.refresh).toHaveBeenCalledOnce();
});
