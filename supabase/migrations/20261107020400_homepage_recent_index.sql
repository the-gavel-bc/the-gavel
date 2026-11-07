-- Bound recent-publication fallback lookups as the article catalog grows.
create index articles_recent_published_idx
on public.articles(published_at desc,id desc)
where status='published';
