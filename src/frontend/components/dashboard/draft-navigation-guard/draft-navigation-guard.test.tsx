import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import {
  DraftNavigationProvider,
  useDraftNavigationGuard,
  useDraftLeaveCheck,
} from "./draft-navigation-guard";
import { DashboardSignOutForm } from "../../../features/auth/components/dashboard-sign-out-form/dashboard-sign-out-form";
function Editor({ dirty }: { dirty: boolean }) {
  useDraftNavigationGuard(dirty);
  const leave = useDraftLeaveCheck();
  return (
    <button
      onClick={() => {
        if (leave()) window.location.hash = "left";
      }}
    >
      Leave
    </button>
  );
}
it("warns while dirty, cancels deliberate leave, and cleans up after confirmation or unmount", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const { rerender, unmount } = render(
    <DraftNavigationProvider>
      <Editor dirty />
    </DraftNavigationProvider>,
  );
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Leave" }));
  expect(window.location.hash).not.toBe("#left");
  rerender(
    <DraftNavigationProvider>
      <Editor dirty={false} />
    </DraftNavigationProvider>,
  );
  const clean = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(clean);
  expect(clean.defaultPrevented).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: "Leave" }));
  expect(window.location.hash).toBe("#left");
  expect(confirm).toHaveBeenCalledOnce();
  unmount();
  const after = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(after);
  expect(after.defaultPrevented).toBe(false);
  window.location.hash = "";
  confirm.mockRestore();
});
it("cancels sign-out before submitting its server action", async () => {
  const action = vi.fn(async () => {});
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(
    <DraftNavigationProvider>
      <Editor dirty />
      <DashboardSignOutForm action={action} />
    </DraftNavigationProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect(action).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect(action).toHaveBeenCalledOnce();
  confirm.mockRestore();
});
