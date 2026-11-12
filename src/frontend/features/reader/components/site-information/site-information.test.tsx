import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { SiteInformationPage } from "./site-information";
const information = {
  mission:
    "First line\nNext line\n\nSecond paragraph <script>alert(1)</script>",
  submissionInstructions: "Send your letter.\n\nInclude your name.",
  contactEmail: "desk?letters@bc.edu",
  instagramUrl: "https://www.instagram.com/thegavel/",
  spotifyUrl: null,
  linkedinUrl: null,
  facebookUrl: null,
};
it("renders mission as escaped paragraphs and preserves single line breaks", () => {
  render(<SiteInformationPage page="about" information={information} />);
  const section = screen.getByRole("region", { name: "Our mission" });
  expect(section.querySelectorAll("p")).toHaveLength(2);
  expect(section.querySelector("p")?.textContent).toBe("First line\nNext line");
  expect(section.querySelector("script")).toBeNull();
  expect(section.textContent).toContain("<script>alert(1)</script>");
  expect(screen.queryByText(/Send your letter/)).toBeNull();
});
it("shows submission copy and configured safe contact destinations only", () => {
  render(<SiteInformationPage page="submission" information={information} />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "How to submit a letter",
  );
  expect(screen.getByText("Include your name.")).toBeVisible();
  expect(
    screen.getByRole("link", { name: "desk?letters@bc.edu" }),
  ).toHaveAttribute("href", "mailto:desk%3Fletters@bc.edu");
  expect(screen.getByRole("link", { name: "Instagram" })).toHaveAttribute(
    "href",
    information.instagramUrl,
  );
  expect(screen.queryByRole("form")).toBeNull();
});
it.each(["about", "submission"] as const)(
  "keeps unset %s content honest without demo history/contact",
  (page) => {
    render(
      <SiteInformationPage
        page={page}
        information={{
          mission: null,
          submissionInstructions: null,
          contactEmail: null,
          instagramUrl: null,
          spotifyUrl: null,
          linkedinUrl: null,
          facebookUrl: null,
        }}
      />,
    );
    expect(screen.getByText(/not available yet/)).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Contact" })).toBeNull();
    expect(
      screen.queryByText(/2009|bcgavel@gmail.com|Staff|History/),
    ).toBeNull();
  },
);
it("distinguishes unavailable service from unprovided copy and offers native retry", () => {
  render(<SiteInformationPage page="submission" information={null} />);
  expect(
    screen.getByRole("heading", {
      name: "Information temporarily unavailable",
    }),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
    "href",
    "/letters/how-to-submit",
  );
  expect(screen.queryByText(/not available yet/)).toBeNull();
});
it("retains long Unicode copy without truncation", () => {
  const mission = "😀".repeat(5000);
  render(
    <SiteInformationPage
      page="about"
      information={{ ...information, mission }}
    />,
  );
  expect(screen.getByText(mission).textContent).toBe(mission);
});
