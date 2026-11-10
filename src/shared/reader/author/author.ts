// Public profile presentation only; identity and membership fields never belong here.
export type PublicAuthor = {
  displayName: string;
  slug: string;
  biography: string | null;
};
