import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("homepage", () => {
  it("identifies The Gavel and offers member sign in", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 1, name: "The Gavel" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Member sign in" }),
    ).toHaveAttribute("href", "/sign-in");
  });
});
