import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ action: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/memberships/member-command/member-actions", () => ({
  manageMembershipAction: mocks.action,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
import { MemberControls } from "./member-controls";

const member = {
  userId: "90000000-0000-0000-0000-000000000005",
  email: "new@bc.edu",
  displayName: null,
  role: null,
  state: "pending",
  version: null,
  eligible: true,
} as const;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true),
  );
});

it("requires a public name and retries one uncertain approval unchanged", async () => {
  mocks.action
    .mockResolvedValueOnce({ ok: false, code: "unavailable" })
    .mockResolvedValueOnce({
      ok: true,
      targetUserId: member.userId,
      role: "author",
      active: true,
      version: 1,
      changed: true,
      replayed: true,
    });
  render(<MemberControls member={member} isSelf={false} />);
  await userEvent.click(
    screen.getByRole("button", { name: "Approve new@bc.edu" }),
  );
  expect(mocks.action).not.toHaveBeenCalled();
  await userEvent.type(
    screen.getByLabelText("Public display name for new@bc.edu"),
    "New Member",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Approve new@bc.edu" }),
  );
  const retry = await screen.findByRole("button", {
    name: "Retry original request",
  });
  expect(screen.getByRole("alert")).toHaveTextContent(/uncertain/i);
  await userEvent.click(retry);
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  expect(mocks.action.mock.calls[1][0]).toEqual(mocks.action.mock.calls[0][0]);
});

it("warns before self-deactivation and reloads after a conflict", async () => {
  const active = {
    ...member,
    displayName: "Admin",
    role: "administrator" as const,
    state: "active" as const,
    version: 2,
  };
  mocks.action.mockResolvedValue({ ok: false, code: "conflict" });
  render(<MemberControls member={active} isSelf />);
  vi.mocked(window.confirm)
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(true);
  await userEvent.click(
    screen.getByRole("button", { name: "Deactivate new@bc.edu" }),
  );
  expect(mocks.action).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Deactivate new@bc.edu" }),
  );
  expect(window.confirm).toHaveBeenCalledWith(
    expect.stringContaining("own membership"),
  );
  expect(
    await screen.findByRole("button", { name: "Reload memberships" }),
  ).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Reload memberships" }),
  );
  expect(mocks.refresh).toHaveBeenCalledOnce();
});
