begin;
select no_plan();
-- Every administrator-only function refuses an editor and an author, even when
-- called directly over the API with otherwise plausible arguments. Each
-- feature's own test covers the administrator path; this sweep closes the
-- "no editor denial" gaps recorded in the code reviews (D-22, D-23, D-25).
update auth.users set email='boundary-'||right(id::text,1)||'@bc.edu',email_confirmed_at=now(),
  raw_app_meta_data='{"provider":"google","providers":["google"]}'::jsonb
  where id in ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003');
update public.memberships set role='author',active=true where user_id='00000000-0000-0000-0000-000000000002';
update public.memberships set role='editor',active=true where user_id='00000000-0000-0000-0000-000000000003';

-- A write is refused when it raises or returns anything but ok:true.
create function pg_temp.write_refused(call text) returns boolean language plpgsql as $$
declare result jsonb;
begin
  execute 'select to_jsonb(('||call||'))' into result;
  return result is null or (result->>'ok') is distinct from 'true';
exception when others then return true;
end;
$$;
-- A read is refused when it raises or returns no rows.
create function pg_temp.read_refused(call text) returns boolean language plpgsql as $$
declare n integer;
begin
  execute 'select count(*) from '||call||' x' into n;
  return n = 0;
exception when others then return true;
end;
$$;
grant execute on function pg_temp.write_refused(text), pg_temp.read_refused(text) to authenticated;

create temp table calls(kind text, label text, call text);
grant select on calls to authenticated;
insert into calls values
  ('read','site settings','public.get_site_information()'),
  ('read','homepage curation','public.get_admin_homepage_curation()'),
  ('read','homepage story library','public.list_homepage_eligible_stories(10,null,null,null)'),
  ('read','media cleanup status','public.get_media_cleanup_status()'),
  ('read','article audit','public.list_article_audit_events(10,null,null,null,null)'),
  ('read','member audit','public.list_membership_audit_events_v2(10,null,null,null)'),
  ('read','section admin list','public.list_admin_taxonomy(''section'',10,null)'),
  ('write','save site settings','public.save_site_information(1,gen_random_uuid(),''Mission'',null,null,null,null,null,null)'),
  ('write','set About image','public.set_site_about_image(''\x524946460000000057454250''::bytea,''Alt'')'),
  ('write','remove About image','public.remove_site_about_image()'),
  ('write','save homepage','public.save_homepage_selections(1,gen_random_uuid(),null,''{}''::uuid[],''{}''::uuid[])'),
  ('write','create section','public.create_taxonomy(''section'',gen_random_uuid(),''Boundary section'',1,null)'),
  ('write','rename tag','public.rename_tag(gen_random_uuid(),gen_random_uuid(),''Renamed'')'),
  ('write','merge tags','public.merge_tags(gen_random_uuid(),gen_random_uuid(),gen_random_uuid())'),
  ('write','delete unused tag','public.delete_unused_tag(gen_random_uuid(),gen_random_uuid())'),
  ('write','invite staff','public.invite_staff(gen_random_uuid(),''[{"email":"boundary-new@bc.edu","role":"author"}]''::jsonb)'),
  ('write','change member role','public.change_membership_role(''00000000-0000-0000-0000-000000000002'',1,gen_random_uuid(),''administrator'')'),
  ('write','deactivate member','public.deactivate_membership(''00000000-0000-0000-0000-000000000002'',1,gen_random_uuid())'),
  ('write','moderate member profile','public.moderate_member_profile(''00000000-0000-0000-0000-000000000002'',1,gen_random_uuid(),true,true,true)'),
  ('write','remove a member photo','public.admin_remove_profile_photo((select id from public.profiles where auth_user_id=''00000000-0000-0000-0000-000000000002''))'),
  ('write','restore archived article','public.restore_article(gen_random_uuid(),1,gen_random_uuid())'),
  ('write','delete archived article','public.delete_archived_article(gen_random_uuid(),1,gen_random_uuid(),true)');

create temp table seen(role text, label text, refused boolean);
grant insert on seen to authenticated;
create function pg_temp.sweep(who text, role_name text) returns void language plpgsql as $$
declare c record;
begin
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000'||who,true);
  set local role authenticated;
  for c in select * from calls loop
    insert into seen values(role_name, c.label,
      case c.kind when 'read' then pg_temp.read_refused(c.call) else pg_temp.write_refused(c.call) end);
  end loop;
  reset role;
end;
$$;
select pg_temp.sweep('2','author');
select pg_temp.sweep('3','editor');

select is((select string_agg(role||': '||label, ', ' order by role,label) from seen where not refused),
  null,'authors and editors are refused by every administrator-only function');
select is((select count(*)::int from seen),(select 2*count(*)::int from calls),'every call was swept for both roles');
-- Nothing changed underneath.
select is((select role::text from public.memberships where user_id='00000000-0000-0000-0000-000000000002'),'author','no role escalation');
select ok((select active from public.memberships where user_id='00000000-0000-0000-0000-000000000002'),'no deactivation');
select is((select count(*)::int from public.sections where name='Boundary section'),0,'no section created');
select is((select count(*)::int from private.membership_invitations where email='boundary-new@bc.edu'),0,'no invitation created');
-- Guard against a vacuous sweep: every call resolves to a real function
-- with valid arguments (as the administrator), and the helpers can say "allowed".
create function pg_temp.call_state(call text) returns text language plpgsql as $$
begin
  execute 'select ('||call||') is null';
  return 'ok';
exception when others then return sqlstate;
end;
$$;
grant execute on function pg_temp.call_state(text) to authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
set local role authenticated;
select is((select string_agg(label||' '||pg_temp.call_state(case kind when 'read' then '(select count(*) from '||call||' x)' else call end), ', ')
  from calls where pg_temp.call_state(case kind when 'read' then '(select count(*) from '||call||' x)' else call end)
    in ('42883','42601','42703','42P01','22P02')),
  null,'every swept call names a real function with valid arguments');
select ok(not pg_temp.read_refused('public.get_site_information()'),'the read helper reports an allowed read');
select ok(not pg_temp.write_refused('public.remove_site_about_image()'),'the write helper reports an allowed write');
reset role;
select * from finish();
rollback;
