"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminArticlePage } from "@/lib/articles/admin-article-queries/admin-article-queries";
import type { HomepageArticle } from "@/lib/homepage/homepage-curation/homepage-curation";

export function PublishedStoryCatalog({
  candidates,
  search,
  hasCursor,
  blocked,
  selectedIds,
  featuredCount,
  readCount,
  notice,
  setNotice,
  add,
}: {
  candidates: AdminArticlePage;
  search: string;
  hasCursor: boolean;
  blocked: boolean;
  selectedIds: string[];
  featuredCount: number;
  readCount: number;
  notice: string;
  setNotice: (value: string) => void;
  add: (
    article: HomepageArticle,
    group: "lead" | "featured" | "readThis",
  ) => void;
}) {
  const router = useRouter();
  const [searchText, setSearchText] = useState(search);
  function searchCatalog(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = searchText.trim();
    if (value.length > 80 || (value && !/^[\p{L}\p{N} '\-]+$/u.test(value))) {
      setNotice(
        "Search accepts letters, numbers, spaces, apostrophes and hyphens.",
      );
      return;
    }
    setNotice("");
    const query = new URLSearchParams();
    if (value) query.set("search", value);
    router.push(`/dashboard/admin/homepage${query.size ? `?${query}` : ""}`);
  }
  const nextQuery = new URLSearchParams();
  if (search) nextQuery.set("search", search);
  if (candidates.nextCursor) nextQuery.set("cursor", candidates.nextCursor);
  return (
    <section aria-label="Published stories">
      <h2>Published stories</h2>
      <form onSubmit={searchCatalog}>
        <label>
          Search titles
          <input
            value={searchText}
            maxLength={80}
            disabled={blocked}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </label>
        <button type="submit" disabled={blocked}>
          Search
        </button>
      </form>
      {notice && <p role="alert">{notice}</p>}
      {candidates.items.length === 0 ? (
        <p>No published stories match.</p>
      ) : (
        <ul>
          {candidates.items.map((article) => (
            <li key={article.id}>
              <strong>{article.title}</strong>
              <button
                type="button"
                disabled={blocked || selectedIds.includes(article.id)}
                onClick={() => add(article, "lead")}
              >
                Set {article.title} as lead
              </button>
              <button
                type="button"
                disabled={
                  blocked ||
                  selectedIds.includes(article.id) ||
                  featuredCount >= 4
                }
                onClick={() => add(article, "featured")}
              >
                Add {article.title} to Featured News
              </button>
              <button
                type="button"
                disabled={
                  blocked || selectedIds.includes(article.id) || readCount >= 4
                }
                onClick={() => add(article, "readThis")}
              >
                Add {article.title} to Read This
              </button>
            </li>
          ))}
        </ul>
      )}
      {hasCursor && (
        <button
          type="button"
          disabled={blocked}
          onClick={() => {
            const query = new URLSearchParams();
            if (search) query.set("search", search);
            router.push(
              `/dashboard/admin/homepage${query.size ? `?${query}` : ""}`,
            );
          }}
        >
          First page
        </button>
      )}
      {candidates.nextCursor && (
        <button
          type="button"
          disabled={blocked}
          onClick={() => router.push(`/dashboard/admin/homepage?${nextQuery}`)}
        >
          Next page
        </button>
      )}
    </section>
  );
}
