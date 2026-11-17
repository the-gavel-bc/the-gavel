// Public profile presentation only; identity and membership fields never belong here.
export type PublicAuthor = {
  displayName: string;
  slug: string;
  biography: string | null;
  /** Same-origin photo URL, or null when the person has no photo. */
  photoUrl: string | null;
};
