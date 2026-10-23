import { execFileSync } from "node:child_process";
import { localSupabase } from "../local-supabase/local-supabase";

export function draftListFixture(project: string) {
  if (project !== "desktop" && project !== "mobile")
    throw new Error("Unknown local browser project.");
  const base = project === "desktop" ? 860 : 880;
  const uuid = (n: number) =>
    `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const id = (n: number) =>
    `86000000-0000-0000-0000-${String(base * 100 + n).padStart(12, "0")}`;
  const users = {
    author: base + 1,
    other: base + 2,
    admin: base + 3,
    empty: base + 4,
  };
  const userIds = Object.values(users).map(uuid);
  const quoted = (ids: string[]) => ids.map((id) => `'${id}'`).join(",");
  const label = `Task 6 ${project}`;
  let installed = false;
  function sql(statement: string) {
    localSupabase();
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "supabase_db_the-gavel",
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-Xq",
        "--single-transaction",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input: statement, stdio: ["pipe", "pipe", "pipe"] },
    );
  }
  return {
    users,
    id,
    label,
    setup() {
      sql(`
        do $$ begin
          if exists(select 1 from auth.users where id in (${quoted(userIds)}))
            or exists(select 1 from public.profiles where id in (${quoted(userIds)}))
            or exists(select 1 from public.sections where id='${id(99)}')
            or exists(select 1 from public.articles where id in (${quoted(Array.from({ length: 24 }, (_, i) => id(i + 1)))}))
          then raise exception 'Reserved draft browser fixture IDs already exist'; end if;
        end $$;
        insert into auth.users (id,instance_id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,encrypted_password,confirmation_token,recovery_token,email_change_token_new,email_change_token_current,email_change,phone_change,phone_change_token,reauthentication_token)
        select value::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
          'gavel-task6-' || right(value,3) || '@bc.edu',now(),'{"provider":"google","providers":["google"]}'::jsonb,'{}'::jsonb,now(),now(),'','','','','','','','',''
        from unnest(array[${quoted(userIds)}]) value;
        insert into public.profiles(id,auth_user_id,display_name,slug)
        select id,id,'Synthetic list member','task6-' || right(id::text,3) from auth.users where id in (${quoted(userIds)});
        insert into public.memberships(user_id,role,active,approved_by,approved_at)
        select id,case when id='${uuid(users.admin)}' then 'administrator'::public.app_role else 'author'::public.app_role end,true,'${uuid(users.admin)}',now()
        from auth.users where id in (${quoted(userIds)});
        insert into public.sections(id,name,slug) values('${id(99)}','Synthetic ${project} list section','task6-${project}');
        insert into public.articles(id,owner_profile_id,section_id,title,slug,status,published_at,archived_at,updated_at)
        select ('86000000-0000-0000-0000-' || lpad((${base * 100}+n)::text,12,'0'))::uuid,
          '${uuid(users.author)}','${id(99)}','${label} own ' || n,'task6-${project}-own-' || n,
          case n when 20 then 'published'::public.article_status when 19 then 'archived'::public.article_status else 'draft'::public.article_status end,
          case when n in (19,20) then '2026-10-22T12:00:00Z'::timestamptz else null end,
          case n when 19 then '2026-10-22T13:00:00Z'::timestamptz else null end,'2026-10-22T12:00:00.123456Z'
        from generate_series(1,21) n;
        insert into public.articles(id,owner_profile_id,section_id,title,slug) values
          ('${id(22)}','${uuid(users.other)}','${id(99)}','${label} other private','task6-${project}-other'),
          ('${id(23)}','${uuid(users.admin)}','${id(99)}','${label} admin own','task6-${project}-admin');
      `);
      installed = true;
    },
    failRead() {
      if (!installed) throw new Error("Fixture is not installed.");
      // PostgreSQL accepts infinity; our bounded summary contract deliberately rejects it.
      sql(`insert into public.articles(id,owner_profile_id,section_id,title,slug,updated_at)
        values('${id(24)}','${uuid(users.author)}','${id(99)}','Synthetic unsupported timestamp','task6-${project}-read-failure','infinity');`);
    },
    recoverRead() {
      if (installed) sql(`delete from public.articles where id='${id(24)}';`);
    },
    cleanup() {
      if (!installed) return;
      sql(`delete from public.articles where id in (${quoted(Array.from({ length: 24 }, (_, i) => id(i + 1)))});
        delete from public.sections where id='${id(99)}';
        delete from public.memberships where user_id in (${quoted(userIds)});
        delete from public.profiles where id in (${quoted(userIds)});
        delete from auth.users where id in (${quoted(userIds)});`);
      installed = false;
    },
  };
}
