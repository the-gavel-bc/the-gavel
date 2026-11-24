export type StaffRole = "author" | "editor" | "administrator";
export type ArticleStanding = {
  role: StaffRole;
  isOwner: boolean;
  status: "draft" | "published" | "archived";
  /** A draft its author has submitted and an editor has not yet resolved. */
  inReview: boolean;
  /** The caller published it (editors may archive only their own publications). */
  publishedByMe: boolean;
};
export type ArticleCapabilities = {
  edit: boolean;
  submit: boolean;
  publish: boolean;
  returnToAuthor: boolean;
  archive: boolean;
  /** Add, change or remove the public correction note. */
  correct: boolean;
  restore: boolean;
};

// Mirrors private.article_authority in the database, which is the real
// boundary; this only decides which controls to offer.
export function articleCapabilities(s: ArticleStanding): ArticleCapabilities {
  const admin = s.role === "administrator";
  const editor = s.role === "editor";
  const draft = s.status === "draft";
  return {
    edit:
      s.status !== "archived" &&
      (admin ||
        (draft && ((s.isOwner && !s.inReview) || (editor && s.inReview)))),
    submit: draft && s.isOwner && !s.inReview && s.role === "author",
    publish: draft && (admin || (editor && (s.isOwner || s.inReview))),
    returnToAuthor: draft && s.inReview && (admin || editor),
    archive: s.status === "published" && (admin || (editor && s.publishedByMe)),
    correct:
      s.status !== "archived" &&
      (admin ||
        (editor &&
          ((draft && s.inReview) ||
            (s.status === "published" && s.publishedByMe)))),
    restore: s.status === "archived" && admin,
  };
}
