import type { PublicArticleCard } from "../article-card/article-card";
export type PublicHomepage = {
  lead: PublicArticleCard | null;
  featured: PublicArticleCard[];
  readThis: PublicArticleCard[];
  latest: PublicArticleCard[];
  sections: { name: string; slug: string; articles: PublicArticleCard[] }[];
};
export type PublicHomepageResult =
  ({ kind: "ok" } & PublicHomepage) | { kind: "unavailable" };
