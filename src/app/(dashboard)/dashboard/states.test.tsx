import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import ErrorBoundary from "./error";
it("shows safe retry and first-page recovery without error details", async () => {
  const reset = vi.fn();
  render(
    <ErrorBoundary error={new Error("private SQL secret")} reset={reset} />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Unable to load your articles",
  );
  expect(screen.queryByText(/private SQL secret/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(reset).toHaveBeenCalledOnce();
  expect(screen.getByRole("link", { name: "Newest articles" })).toHaveAttribute(
    "href",
    "/dashboard",
  );
});
