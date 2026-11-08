import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PublicShell } from "./public-shell";

describe("PublicShell", () => {
  it("provides one semantic page shell and keyboard-first navigation", async () => {
    const user = userEvent.setup();
    render(
      <PublicShell>
        <h1>Latest stories</h1>
      </PublicShell>,
    );

    expect(screen.getAllByRole("banner")).toHaveLength(1);
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getAllByRole("contentinfo")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "The Gavel" })).toBeVisible();

    const skipLink = screen.getByRole("link", { name: "Skip to content" });
    expect(skipLink).toHaveAttribute("href", "#main-content");

    await user.tab();
    expect(skipLink).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "The Gavel" })).toHaveFocus();
  });
});
