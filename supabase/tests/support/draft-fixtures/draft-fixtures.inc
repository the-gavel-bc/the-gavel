-- Include only inside a rollback transaction; no real taxonomy or identities.
update auth.users set email='draft-'||right(id::text,1)||'@bc.edu', email_confirmed_at=now(),
  raw_app_meta_data='{"provider":"google","providers":["google"]}'
where id in ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004');
insert into public.sections(id,name,slug,active) values
('20000000-0000-0000-0000-000000000051','Synthetic Draft Section','synthetic-draft-section',true),
('20000000-0000-0000-0000-000000000052','Synthetic Other Section','synthetic-other-section',false);
insert into public.categories(id,section_id,name,slug,active) values
('30000000-0000-0000-0000-000000000051','20000000-0000-0000-0000-000000000051','Synthetic Match','synthetic-match',true),
('30000000-0000-0000-0000-000000000052','20000000-0000-0000-0000-000000000052','Synthetic Mismatch','synthetic-mismatch',true),
('30000000-0000-0000-0000-000000000053','20000000-0000-0000-0000-000000000051','Synthetic Inactive','synthetic-inactive',false);
insert into public.tags(id,name,slug) values ('40000000-0000-0000-0000-000000000051','Synthetic Draft Tag','synthetic-draft-tag');
insert into public.profiles(id,display_name,slug,active) values
('10000000-0000-0000-0000-000000000051','Synthetic Guest','synthetic-guest',true),
('10000000-0000-0000-0000-000000000052','Synthetic Inactive Guest','synthetic-inactive-guest',false);
create function pg_temp.draft_input(p_patch jsonb default '{}') returns jsonb language sql as $$
select '{"schemaVersion":1,"title":"Synthetic Draft","sectionId":"20000000-0000-0000-0000-000000000051","excerpt":null,"content":null,"seoKeyphrase":null,"metaDescription":null,"categoryIds":[],"tagIds":[],"contributors":[]}'::jsonb || p_patch;
$$;
-- Test cases call the fixture builder after switching to authenticated.
grant execute on function pg_temp.draft_input(jsonb) to authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
