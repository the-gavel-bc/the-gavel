import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { parseInviteText } from "@/shared/memberships/invitation-command/invitation-command";
const mocks = vi.hoisted(() => ({ action: vi.fn(), refresh: vi.fn() }));
vi.mock("@/backend/memberships/invitation-command/invitation-actions", () => ({
  manageInvitationAction: mocks.action,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
import { AddPeopleForm } from "./add-people-form";

beforeEach(() => vi.clearAllMocks());

it("parses lines, commas, names and duplicates", () => {
  expect(
    parseInviteText(
      "A@bc.edu\nb@bc.edu, Bee Person\nc@bc.edu, d@bc.edu; A@BC.edu\nbad@gmail.com",
    ),
  ).toEqual({
    entries: [
      { email: "a@bc.edu", displayName: null },
      { email: "b@bc.edu", displayName: "Bee Person" },
      { email: "c@bc.edu", displayName: null },
      { email: "d@bc.edu", displayName: null },
    ],
    invalid: ["bad@gmail.com"],
  });
});

it("rejects non-BC addresses before any request", async () => {
  render(<AddPeopleForm />);
  await userEvent.type(
    screen.getByLabelText("BC email addresses"),
    "x@gmail.com",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Add to staff list" }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent(/name@bc\.edu/);
  expect(mocks.action).not.toHaveBeenCalled();
});

it("adds everyone with one role and reports members that were skipped", async () => {
  mocks.action.mockResolvedValue({
    ok: true,
    added: 2,
    updated: 0,
    skipped: ["old@bc.edu"],
  });
  render(<AddPeopleForm />);
  await userEvent.type(
    screen.getByLabelText("BC email addresses"),
    "a@bc.edu{enter}b@bc.edu{enter}old@bc.edu",
  );
  await userEvent.selectOptions(
    screen.getByLabelText("Role for everyone listed"),
    "administrator",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Add to staff list" }),
  );
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  expect(mocks.action.mock.calls[0][0]).toMatchObject({
    kind: "invite",
    entries: [
      { email: "a@bc.edu", role: "administrator" },
      { email: "b@bc.edu", role: "administrator" },
      { email: "old@bc.edu", role: "administrator" },
    ],
  });
  expect(screen.getByRole("status")).toHaveTextContent(/Added 2.*old@bc\.edu/);
});

it("retries an uncertain request with the original id", async () => {
  mocks.action
    .mockResolvedValueOnce({ ok: false, code: "unavailable" })
    .mockResolvedValueOnce({ ok: true, added: 1, updated: 0, skipped: [] });
  render(<AddPeopleForm />);
  await userEvent.type(screen.getByLabelText("BC email addresses"), "a@bc.edu");
  await userEvent.click(
    screen.getByRole("button", { name: "Add to staff list" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Retry original request" }),
  );
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  expect(mocks.action.mock.calls[1][0]).toEqual(mocks.action.mock.calls[0][0]);
});
