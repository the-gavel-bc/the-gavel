import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardNav, isActive } from "./dashboard-nav";

const pathname = vi.hoisted(() => ({ value: "/dashboard" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

describe("DashboardNav", () => {
  it("marks only the current page and hides admin links from authors", () => {
    pathname.value = "/dashboard";
    render(<DashboardNav isAdmin={false} />);
    expect(screen.getByRole("link", { name: "My articles" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Profile" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(
      screen.queryByRole("link", { name: "Site information" }),
    ).not.toBeInTheDocument();
  });

  it("lists every admin page and marks nested routes active", () => {
    pathname.value = "/dashboard/admin/articles/abc";
    render(<DashboardNav isAdmin />);
    expect(
      screen.getByRole("link", { name: "Administration" }),
    ).toHaveAttribute("aria-current", "page");
    for (const name of [
      "Article activity",
      "Homepage",
      "Memberships",
      "Taxonomy",
      "Site information",
      "Media cleanup",
    ])
      expect(screen.getByRole("link", { name })).toBeVisible();
    expect(
      screen.getByRole("link", { name: "My articles" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("does not treat sibling prefixes as active", () => {
    expect(
      isActive("/dashboard/admin/members-old", {
        href: "/dashboard/admin/members",
        label: "",
      }),
    ).toBe(false);
  });
});
