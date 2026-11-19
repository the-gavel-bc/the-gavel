-- Publication provenance must never block removing a profile (tests and any
-- future hard delete): forget the publisher instead.
alter table public.articles drop constraint articles_published_by_profile_id_fkey;
alter table public.articles add constraint articles_published_by_profile_id_fkey
  foreign key (published_by_profile_id) references public.profiles(id) on delete set null;
