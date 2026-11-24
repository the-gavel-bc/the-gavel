import { expect, it } from "vitest";
import {
  guestContributorCommandSchema,
  guestContributorTransportSchema,
} from "@/shared/contributors/guest-contributor/guest-contributor";
import {
  ownProfileCommandSchema,
  ownProfileTransportSchema,
} from "@/shared/profiles/own-profile/own-profile-command";
import {
  siteInformationCommandSchema,
  siteInformationTransportSchema,
} from "@/shared/site-information/site-information/site-information-command";

const base = {
  requestId: "77000000-0000-0000-0000-000000000001",
  expectedVersion: 1,
};
it.each(["\u0892", "\u202e", "\u2800", "\u3164", "\u{E0001}"])(
  "checks new display text without blocking legacy payload transport",
  (character) => {
    const text = `News${character}desk`;
    const profile = { ...base, displayName: text, biography: text };
    const guest = { requestId: base.requestId, displayName: text };
    const site = {
      ...base,
      mission: text,
      contactEmail: null,
      instagramUrl: null,
      spotifyUrl: null,
      linkedinUrl: null,
      facebookUrl: null,
    };
    expect(ownProfileCommandSchema.safeParse(profile).success).toBe(false);
    expect(guestContributorCommandSchema.safeParse(guest).success).toBe(false);
    expect(siteInformationCommandSchema.safeParse(site).success).toBe(false);
    expect(ownProfileTransportSchema.parse(profile)).toEqual(profile);
    expect(guestContributorTransportSchema.parse(guest)).toEqual(guest);
    expect(siteInformationTransportSchema.parse(site)).toEqual(site);
  },
);

it("checks the raw guest name before normalizing it", () => {
  const guest = { requestId: base.requestId, displayName: "\uFEFFDesk" };
  expect(guestContributorCommandSchema.safeParse(guest).success).toBe(false);
  expect(guestContributorTransportSchema.parse(guest).displayName).toBe("Desk");
});
