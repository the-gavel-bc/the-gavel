export type PublicSection = {
  name: string;
  slug: string;
  categories: { name: string; slug: string }[];
};
export type PublicSiteInformation = {
  mission: string | null;
  contactEmail: string | null;
  instagramUrl: string | null;
  spotifyUrl: string | null;
  linkedinUrl: string | null;
  facebookUrl: string | null;
  submissionInstructions: string | null;
};
