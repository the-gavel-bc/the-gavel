// Browser-safe public summary shape; the server reader validates these fields.
export type PublicArticleCard = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  publishedAt: string;
  section: { name: string; slug: string };
  owner: { displayName: string; slug: string | null };
  writers: { displayName: string; slug: string | null }[];
  mainImage: {
    id: string;
    width: number;
    height: number;
    alt: string;
    credit: string;
  } | null;
};
