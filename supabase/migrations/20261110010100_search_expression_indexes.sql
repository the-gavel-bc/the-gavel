-- One statement makes the index batch atomic, including on migration runners
-- without an enclosing transaction. Lock contention fails safely for retry.
do $$ begin
  perform pg_catalog.set_config('lock_timeout','5s',true);
  create index articles_published_search_words_idx on public.articles using gin
    (private.article_search_lexemes(title,excerpt,meta_description,content)) where status='published';
  -- Joined labels stay on their own records: renames maintain these indexes in
  -- the same transaction, without an article fan-out refresh or retry ledger.
  create index profiles_active_search_words_idx on public.profiles using gin
    (private.search_lexemes(display_name)) where active;
  create index sections_active_search_words_idx on public.sections using gin
    (private.search_lexemes(name)) where active;
  create index categories_active_search_words_idx on public.categories using gin
    (private.search_lexemes(name)) where active;
  create index tags_search_words_idx on public.tags using gin (private.search_lexemes(name));
end $$;
