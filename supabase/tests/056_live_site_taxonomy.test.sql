begin;
select no_plan();
-- The seeded taxonomy is exactly the live-site navigation (owner input 2026-11-12).
select results_eq(
  $$select name from public.sections where active order by navigation_order,slug$$,
  $$values ('Features'),('Opinions'),('Culture'),('Sports'),('Allston-Brighton'),('Letter to the Editor')$$,
  'sections match the live menu order');
select is_empty($$select 1 from public.sections where lower(name)='news'$$,'no top-level News section');
select results_eq(
  $$select s.slug||'/'||c.name from public.categories c join public.sections s on s.id=c.section_id
    where c.active order by s.navigation_order,c.navigation_order$$,
  $$values ('features/On Campus'),('features/Outside of BC'),('features/Authentic Eagles'),
    ('opinions/Beyond Campus'),('opinions/Campus POV'),
    ('culture/Politics and Activism'),('culture/Arts and Entertainment'),
    ('sports/Football'),('sports/Hockey'),('sports/Basketball'),('sports/Press Pass'),
    ('allston-brighton/News'),('allston-brighton/Culture and Community')$$,
  'categories match the live dropdowns');
select is_empty($$select 1 from public.categories c join public.sections s on s.id=c.section_id
  where s.slug='letter-to-the-editor'$$,'How to Submit is a page, not a letters category');
set local role anon;
select is(jsonb_array_length(public.get_public_site_navigation()->'sections'),6,'public navigation lists the six sections');
select is(public.get_public_site_navigation()#>>'{sections,0,categories,1,slug}','outside-of-bc','public navigation keeps category order');
reset role;
select * from finish();
rollback;
