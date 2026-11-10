// Browser-safe public summary shape; the server reader validates these fields.
export type PublicArticleCard = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  publishedAt: string;
  section: { name: string; slug: string };
  owner: { displayName: string; slug: string };
  writers: { displayName: string; slug: string }[];
  mainImage: {
    id: string;
    width: number;
    height: number;
    alt: string;
    credit: string;
  } | null;
};
