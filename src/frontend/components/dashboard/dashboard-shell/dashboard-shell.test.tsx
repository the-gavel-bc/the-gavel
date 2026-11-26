import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardShell } from "./dashboard-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

describe("DashboardShell", () => {
  it("hides administrator navigation from authors", () => {
    render(
      <DashboardShell displayName="Alex Author" isAdmin={false}>
        <h1>My articles</h1>
      </DashboardShell>,
    );

    expect(screen.getAllByRole("banner")).toHaveLength(1);
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getAllByRole("contentinfo")).toHaveLength(1);
    expect(screen.getByText("Signed in as Alex Author")).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Administration" }),
    ).not.toBeInTheDocument();
  });

  it("shows administrator navigation to administrators", () => {
    render(
      <DashboardShell displayName="Avery Admin" isAdmin>
        <h1>Dashboard</h1>
      </DashboardShell>,
    );

    expect(
      screen.getByRole("link", { name: "Administration" }),
    ).toHaveAttribute("href", "/dashboard/admin/articles");
  });
});
