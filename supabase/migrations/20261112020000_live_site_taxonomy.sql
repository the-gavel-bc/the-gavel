-- Owner-provided publication taxonomy (live-site navigation, 2026-11-12).
-- There is no administrator create operation, so the initial sections and
-- categories are seeded here. Idempotent: existing names are left untouched so
-- administrators' later renames, ordering and deactivation are preserved.
-- "How to Submit" under Letter to the Editor is a page, not a category.
with wanted(name,slug,navigation_order) as (values
  ('Features','features',1),
  ('Opinions','opinions',2),
  ('Culture','culture',3),
  ('Sports','sports',4),
  ('Allston-Brighton','allston-brighton',5),
  ('Letter to the Editor','letter-to-the-editor',6))
insert into public.sections(name,slug,navigation_order)
select w.name,w.slug,w.navigation_order from wanted w
where not exists(select 1 from public.sections s where lower(s.name)=lower(w.name) or s.slug=w.slug);

with wanted(section_slug,name,slug,navigation_order) as (values
  ('features','On Campus','on-campus',1),
  ('features','Outside of BC','outside-of-bc',2),
  ('features','Authentic Eagles','authentic-eagles',3),
  ('opinions','Beyond Campus','beyond-campus',1),
  ('opinions','Campus POV','campus-pov',2),
  ('culture','Politics and Activism','politics-and-activism',1),
  ('culture','Arts and Entertainment','arts-and-entertainment',2),
  ('sports','Football','football',1),
  ('sports','Hockey','hockey',2),
  ('sports','Basketball','basketball',3),
  ('sports','Press Pass','press-pass',4),
  ('allston-brighton','News','news',1),
  ('allston-brighton','Culture and Community','culture-and-community',2))
insert into public.categories(section_id,name,slug,navigation_order)
select s.id,w.name,w.slug,w.navigation_order from wanted w
join public.sections s on s.slug=w.section_slug
where not exists(select 1 from public.categories c
  where c.section_id=s.id and (lower(c.name)=lower(w.name) or c.slug=w.slug));
