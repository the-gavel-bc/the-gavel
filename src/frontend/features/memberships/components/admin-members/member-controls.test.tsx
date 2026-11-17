import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  member: vi.fn(),
  invitation: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/backend/memberships/member-command/member-actions", () => ({
  manageMembershipAction: mocks.member,
}));
vi.mock("@/backend/memberships/invitation-command/invitation-actions", () => ({
  manageInvitationAction: mocks.invitation,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
import { MemberControls } from "./member-controls";

const id = "90000000-0000-0000-0000-000000000005";
const invited = {
  key: id,
  userId: null,
  invitationId: id,
  email: "new@bc.edu",
  displayName: null,
  role: "author",
  state: "invited",
  version: 1,
  eligible: true,
} as const;
const active = {
  ...invited,
  userId: id,
  invitationId: null,
  displayName: "Admin",
  role: "administrator",
  state: "active",
  version: 2,
} as const;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true),
  );
});

it("changes a listed person's role and retries one uncertain request unchanged", async () => {
  mocks.invitation
    .mockResolvedValueOnce({ ok: false, code: "unavailable" })
    .mockResolvedValueOnce({ ok: true, changed: true });
  render(<MemberControls member={invited} isSelf={false} />);
  expect(
    screen.getByRole("button", { name: "Change role for new@bc.edu" }),
  ).toBeDisabled();
  await userEvent.selectOptions(
    screen.getByLabelText("Role for new@bc.edu"),
    "administrator",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Change role for new@bc.edu" }),
  );
  const retry = await screen.findByRole("button", {
    name: "Retry original request",
  });
  expect(screen.getByRole("alert")).toHaveTextContent(/uncertain/i);
  await userEvent.click(retry);
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  expect(mocks.invitation.mock.calls[1][0]).toEqual(
    mocks.invitation.mock.calls[0][0],
  );
  expect(mocks.invitation.mock.calls[0][0]).toMatchObject({
    kind: "changeRole",
    invitationId: id,
    expectedVersion: 1,
    role: "administrator",
  });
});

it("removes a listed person only after confirmation", async () => {
  mocks.invitation.mockResolvedValue({ ok: true, changed: true });
  render(<MemberControls member={invited} isSelf={false} />);
  vi.mocked(window.confirm).mockReturnValueOnce(false);
  await userEvent.click(
    screen.getByRole("button", { name: "Remove new@bc.edu" }),
  );
  expect(mocks.invitation).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Remove new@bc.edu" }),
  );
  await waitFor(() =>
    expect(mocks.invitation).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "remove", invitationId: id }),
    ),
  );
});

it("warns before self-deactivation and reloads after a conflict", async () => {
  mocks.member.mockResolvedValue({ ok: false, code: "conflict" });
  render(<MemberControls member={active} isSelf />);
  vi.mocked(window.confirm)
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(true);
  await userEvent.click(
    screen.getByRole("button", { name: "Deactivate new@bc.edu" }),
  );
  expect(mocks.member).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Deactivate new@bc.edu" }),
  );
  expect(window.confirm).toHaveBeenCalledWith(
    expect.stringContaining("own membership"),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Reload memberships" }),
  );
  expect(mocks.refresh).toHaveBeenCalledOnce();
});

it("reactivates an inactive member with their existing name", async () => {
  mocks.member.mockResolvedValue({
    ok: true,
    targetUserId: id,
    role: "author",
    active: true,
    version: 3,
    changed: true,
    replayed: false,
  });
  render(
    <MemberControls
      member={{ ...active, state: "inactive", role: "author" }}
      isSelf={false}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Reactivate new@bc.edu" }),
  );
  expect(mocks.member).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "approve", displayName: "Admin" }),
  );
});
