import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";
import { PublicShell } from "@/frontend/components/site/public-shell/public-shell";

describe("homepage", () => {
  it("identifies The Gavel and offers member sign in", () => {
    // The route group now owns the shell; the page owns homepage content.
    render(
      <PublicShell>
        <Home />
      </PublicShell>,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "The Gavel" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Member sign in" }),
    ).toHaveAttribute("href", "/sign-in");
  });
});
