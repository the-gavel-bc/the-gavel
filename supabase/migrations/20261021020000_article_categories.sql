-- Composite references make section consistency hold for link and parent changes.
alter table public.articles add constraint articles_id_section_key unique (id, section_id);
alter table public.categories add constraint categories_id_section_key unique (id, section_id);

create table public.article_categories (
  article_id uuid not null,
  category_id uuid not null,
  section_id uuid not null,
  primary key (article_id, category_id),
  constraint article_categories_article_section_fkey
    foreign key (article_id, section_id) references public.articles(id, section_id)
    on update restrict on delete restrict,
  constraint article_categories_category_section_fkey
    foreign key (category_id, section_id) references public.categories(id, section_id)
    on update restrict on delete restrict
);

-- The primary key covers article lookups; this index covers the reverse parent.
create index article_categories_category_section_idx on public.article_categories (category_id, section_id);

alter table public.article_categories enable row level security;
revoke all on table public.article_categories from public, anon, authenticated;
grant select on table public.article_categories to authenticated;
create policy article_categories_article_read on public.article_categories for select to authenticated
using (private.can_read_article(article_id));
