import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import AdminSitePage from "./page";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  read: vi.fn(),
  form: vi.fn(),
}));
vi.mock("@/backend/auth/access/access", () => ({
  requireActiveMembership: mocks.access,
}));
vi.mock("@/backend/site-information/site-information/site-information", () => ({
  getSiteInformation: mocks.read,
}));
vi.mock(
  "@/frontend/features/site-information/components/admin-site/site-information-form",
  () => ({
    SiteInformationForm: (props: unknown) => {
      mocks.form(props);
      return <p>Settings form</p>;
    },
  }),
);

it.each(["author", "editor"])(
  "refuses %s before loading settings",
  async (role) => {
    mocks.access.mockResolvedValue({ role });
    mocks.read.mockClear();
    render(await AdminSitePage());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Administrator access required.",
    );
    expect(mocks.read).not.toHaveBeenCalled();
  },
);

it("shows settings on success and a safe retry link on failure", async () => {
  mocks.access.mockResolvedValue({ role: "administrator" });
  const information = {
    version: 1,
    mission: "Fixture mission",
    submissionInstructions: null,
    contactEmail: null,
    instagramUrl: null,
    spotifyUrl: null,
    linkedinUrl: null,
    facebookUrl: null,
  };
  mocks.read
    .mockResolvedValueOnce(information)
    .mockRejectedValueOnce(new Error("private settings diagnostic"));
  const { rerender } = render(await AdminSitePage());
  expect(screen.getByText("Settings form")).toBeVisible();
  expect(mocks.form).toHaveBeenLastCalledWith({ information });
  rerender(await AdminSitePage());
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Unable to load site information.",
  );
  expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
    "href",
    "/dashboard/admin/site",
  );
  expect(
    screen.queryByText("private settings diagnostic"),
  ).not.toBeInTheDocument();
});
