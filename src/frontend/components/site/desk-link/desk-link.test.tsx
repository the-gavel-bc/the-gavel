import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DeskLink, initials } from "./desk-link";

afterEach(() => vi.unstubAllGlobals());
const respond = (body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(body)),
  );

it("shows a desk shortcut only for an active member", async () => {
  respond({ desk: { displayName: "Avery Quinn", role: "administrator" } });
  render(<DeskLink />);
  const link = await screen.findByRole("link", {
    name: "Your desk (Avery Quinn, administrator)",
  });
  expect(link).toHaveAttribute("href", "/dashboard");
  expect(link).toHaveTextContent("AQ");
});

it("renders nothing for readers", async () => {
  respond({ desk: null });
  const { container } = render(<DeskLink />);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(container).toBeEmptyDOMElement();
});

it("builds initials from names and emails", () => {
  expect(initials("Avery Quinn")).toBe("AQ");
  expect(initials("sam@bc.edu")).toBe("SB");
  expect(initials("Cher")).toBe("C");
});
