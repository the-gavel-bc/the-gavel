import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { SiteFooter } from "../site-footer/site-footer";
import { StayConnected } from "./social-links";

const information = {
  mission: "Our mission.",
  contactEmail: "desk@bc.edu",
  instagramUrl: "https://www.instagram.com/bcgavel/",
  spotifyUrl: "https://open.spotify.com/show/2abc",
  linkedinUrl: null,
  facebookUrl: "https://www.facebook.com/bcgavel",
  submissionInstructions: null,
};

it("shows only the configured social links, with readable names", () => {
  render(<StayConnected information={information} />);
  const region = screen.getByRole("region", { name: "Stay Connected" });
  const links = within(region).getAllByRole("link");
  expect(
    links.map((link) => [link.textContent, link.getAttribute("href")]),
  ).toEqual([
    ["Instagram", information.instagramUrl],
    ["Spotify", information.spotifyUrl],
    ["Facebook", information.facebookUrl],
  ]);
  expect(region.querySelectorAll("svg[aria-hidden='true']")).toHaveLength(3);
});

it("renders nothing when no social link is configured", () => {
  const { container } = render(
    <StayConnected
      information={{
        ...information,
        instagramUrl: null,
        spotifyUrl: null,
        facebookUrl: null,
      }}
    />,
  );
  expect(container).toBeEmptyDOMElement();
});

it("gives the footer its publication copy, contact and labelled icon links", () => {
  render(
    <SiteFooter
      information={information}
      readThis={[
        {
          id: "00000000-0000-4000-8000-000000000001",
          slug: "a-story",
          title: "A story",
          mainImage: null,
        },
      ]}
    />,
  );
  expect(screen.getByText("Est. 2009")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "desk@bc.edu" })).toHaveAttribute(
    "href",
    "mailto:desk@bc.edu",
  );
  for (const name of ["Instagram", "Spotify", "Facebook"])
    expect(screen.getByRole("link", { name })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "LinkedIn" })).toBeNull();
  expect(screen.getByRole("link", { name: "A story" })).toHaveAttribute(
    "href",
    "/articles/a-story",
  );
  expect(screen.getByRole("link", { name: "Member sign in" })).toHaveAttribute(
    "href",
    "/sign-in",
  );
});
