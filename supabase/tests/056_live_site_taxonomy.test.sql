begin;
select no_plan();
\ir support/review-fixtures/review-fixtures.inc

-- Check the approved seed without relying on the absence of administrator-created rows.
create temp table seeded_sections(slug text, name text, position bigint generated always as identity);
insert into seeded_sections(slug,name) values
  ('features','Features'),('opinions','Opinions'),('culture','Culture'),('sports','Sports'),
  ('allston-brighton','Allston-Brighton'),('letter-to-the-editor','Letter to the Editor');
create temp table seeded_categories(section_slug text, slug text, name text, position bigint generated always as identity);
insert into seeded_categories(section_slug,slug,name) values
  ('features','on-campus','On Campus'),('features','outside-of-bc','Outside of BC'),
  ('features','authentic-eagles','Authentic Eagles'),('opinions','beyond-campus','Beyond Campus'),
  ('opinions','campus-pov','Campus POV'),('culture','politics-and-activism','Politics and Activism'),
  ('culture','arts-and-entertainment','Arts and Entertainment'),('sports','football','Football'),
  ('sports','hockey','Hockey'),('sports','basketball','Basketball'),('sports','press-pass','Press Pass'),
  ('allston-brighton','news','News'),('allston-brighton','culture-and-community','Culture and Community');

-- The public reader applies section and category caps to the whole catalog.
-- Leave room for one custom row in each group without changing the seed.
update public.sections set active=false where id in (
  select id from public.sections where active and slug not in(select slug from seeded_sections)
  order by id limit greatest((select count(*) from public.sections where active)-99,0)
);
update public.categories set active=false where id in (
  select c.id from public.categories c join public.sections s on s.id=c.section_id
  where c.active and s.active and (s.slug,c.slug) not in(select section_slug,slug from seeded_categories)
  order by c.id limit greatest((
    select count(*) from public.categories c join public.sections s on s.id=c.section_id
    where c.active and s.active
  )-999,0)
);
insert into public.sections(name,slug,navigation_order)
values('Custom fixture '||pg_temp.review_fixture_token(),'custom-fixture-'||pg_temp.review_fixture_token(),0);
insert into public.categories(section_id,name,slug,navigation_order)
select id,'Custom fixture '||pg_temp.review_fixture_token(),'custom-fixture-'||pg_temp.review_fixture_token(),0
from public.sections where slug='features';

select results_eq(
  $$select name from public.sections where active and slug in (select slug from seeded_sections)
    order by navigation_order,slug$$,
  $$select name from seeded_sections order by position$$,
  'seeded sections keep the approved menu order alongside custom sections');
select results_eq(
  $$select s.slug,c.slug,c.name from public.categories c join public.sections s on s.id=c.section_id
    where c.active and (s.slug,c.slug) in (select section_slug,slug from seeded_categories)
    order by s.navigation_order,c.navigation_order,c.slug$$,
  $$select section_slug,slug,name from seeded_categories order by position$$,
  'seeded categories keep their scoped names and order alongside custom categories');

grant select on seeded_sections, seeded_categories to anon;
set local role anon;
select results_eq(
  $$select item->>'slug',item->>'name'
    from jsonb_array_elements(public.get_public_site_navigation()->'sections') with ordinality as sections(item,position)
    where item->>'slug' in(select slug from seeded_sections) order by position$$,
  $$select slug,name from seeded_sections order by position$$,
  'public navigation keeps the approved seed in order alongside custom sections');
select results_eq(
  $$select category->>'slug' from jsonb_array_elements(public.get_public_site_navigation()->'sections') as sections(item)
    cross join lateral jsonb_array_elements(item->'categories') with ordinality as categories(category,position)
    where item->>'slug'='features' and category->>'slug' in (
      select slug from seeded_categories where section_slug='features') order by position$$,
  $$select slug from seeded_categories where section_slug='features' order by position$$,
  'public navigation keeps the seeded Features category order');
select ok(exists(
  select 1 from jsonb_array_elements(public.get_public_site_navigation()->'sections') as sections(item)
  where item->>'slug'='custom-fixture-'||pg_temp.review_fixture_token()
), 'public navigation also exposes the custom active section');
select ok(exists(
  select 1 from jsonb_array_elements(public.get_public_site_navigation()->'sections') as sections(item)
  cross join lateral jsonb_array_elements(item->'categories') as categories(category)
  where item->>'slug'='features' and category->>'slug'='custom-fixture-'||pg_temp.review_fixture_token()
), 'public navigation also exposes the custom active category');
reset role;
select * from finish();
rollback;
