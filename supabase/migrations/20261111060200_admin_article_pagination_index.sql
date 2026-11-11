-- Bound broad administrator pagination without sorting the full article catalog.
create index articles_updated_page_idx
on public.articles(updated_at desc,id desc);
