vi.mock("@/backend/infrastructure/env/server/server", () => ({
  getServerEnv: () => ({ SITE_URL: "https://gavel.example" }),
}));
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const read = vi.hoisted(() => vi.fn());
vi.mock(
  "@/backend/public-site/public-site-navigation/public-site-navigation",
  () => ({ getPublicSiteNavigationForRequest: read }),
);
import About, { generateMetadata as aboutMetadata } from "./page";
import Submit, {
  generateMetadata as submitMetadata,
} from "../letters/how-to-submit/page";
const information = {
  mission: "Approved mission",
  submissionInstructions: "Approved instructions",
  contactEmail: null,
  instagramUrl: null,
  spotifyUrl: null,
  linkedinUrl: null,
  facebookUrl: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  read.mockResolvedValue({ kind: "ok", sections: [], information });
});
it("routes use the existing request-cached public reader and correct fields", async () => {
  render(await About());
  expect(screen.getByText("Approved mission")).toBeVisible();
  expect(read).toHaveBeenCalledTimes(1);
  expect(await aboutMetadata()).toMatchObject({ title: "About The Gavel" });
  expect(await submitMetadata()).toMatchObject({
    title: "How to submit a letter",
  });
});
it("renders the independent submission route", async () => {
  render(await Submit());
  expect(screen.getByText("Approved instructions")).toBeVisible();
  expect(screen.queryByText("Approved mission")).toBeNull();
});
it.each(["unset", "unavailable"])(
  "excludes %s primary copy from indexing",
  async (kind) => {
    read.mockResolvedValue(
      kind === "unavailable"
        ? { kind }
        : {
            kind: "ok",
            sections: [],
            information: {
              ...information,
              mission: null,
              submissionInstructions: null,
            },
          },
    );
    expect(await aboutMetadata()).toMatchObject({
      robots: { index: false, follow: false },
    });
    expect(await submitMetadata()).toMatchObject({
      robots: { index: false, follow: false },
    });
    render(await About());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "About The Gavel",
    );
  },
);

it("each information route has its own canonical identity", async () => {
  expect((await aboutMetadata()).alternates?.canonical).toBe(
    "https://gavel.example/about",
  );
  expect((await submitMetadata()).alternates?.canonical).toBe(
    "https://gavel.example/letters/how-to-submit",
  );
});
