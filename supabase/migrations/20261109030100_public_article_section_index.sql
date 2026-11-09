-- Keep section and category archive scans ordered without sorting the full section.
create index articles_published_section_page_idx
on public.articles(section_id,published_at desc,id desc)
where status='published';
