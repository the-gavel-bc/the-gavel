import type { DraftDocument } from "@/shared/articles/draft-contract/draft-contract";

type Person = { displayName: string; slug: string | null };
type Taxonomy = { id: string; name: string; slug: string };
export type ReaderImage = { id: string; width: number; height: number };

export type ReaderArticle = {
  id: string;
  title: string;
  excerpt: string | null;
  publishedAt: string;
  content: DraftDocument | null;
  section: Taxonomy;
  owner: Person & { biography: string | null };
  categories: Taxonomy[];
  tags: Taxonomy[];
  contributors: (Person & {
    role: "writer" | "editor" | "creative";
    displayOrder: number;
  })[];
  mainImage:
    | (ReaderImage & { alt: string; credit: string; caption: string | null })
    | null;
  bodyImages: ReaderImage[];
};

export type ArticleImageUrl = (articleId: string, assetId: string) => string;

export const publicArticleImageUrl: ArticleImageUrl = (articleId, assetId) =>
  `/api/public/articles/${articleId.toLowerCase()}/media/${assetId.toLowerCase()}`;
