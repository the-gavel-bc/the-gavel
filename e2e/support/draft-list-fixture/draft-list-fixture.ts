import { execFileSync } from "node:child_process";
import { localSupabase } from "../local-supabase/local-supabase";

export function draftListFixture(
  project: string,
  suite: "list" | "create" | "edit" | "select" = "list",
) {
  if (project !== "desktop" && project !== "mobile")
    throw new Error("Unknown local browser project.");
  const base =
    (project === "desktop" ? 860 : 880) +
    (suite === "select"
      ? 120
      : suite === "edit"
        ? 80
        : suite === "create"
          ? 40
          : 0);
  const prefix = `${suite === "select" ? "task9" : suite === "edit" ? "task8" : suite === "create" ? "task7" : "task6"}-${project}`;
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
  const label = `Task ${suite === "select" ? 9 : suite === "edit" ? 8 : suite === "create" ? 7 : 6} ${project}`;
  let installed = false;
  let selectionsInstalled = false;
  function sql(statement: string) {
    localSupabase();
    return execFileSync(
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
        "-XqAt",
        "--single-transaction",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      {
        input: statement,
        encoding: "utf8",
        maxBuffer: 5 * 1024 * 1024,
        stdio: ["pipe", "pipe", "pipe"],
      },
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
        insert into public.sections(id,name,slug) values('${id(99)}','Synthetic ${project} ${suite} section','${prefix}');
        insert into public.articles(id,owner_profile_id,section_id,title,slug,status,published_at,archived_at,updated_at)
        select ('86000000-0000-0000-0000-' || lpad((${base * 100}+n)::text,12,'0'))::uuid,
          '${uuid(users.author)}','${id(99)}','${label} own ' || n,'${prefix}-own-' || n,
          case n when 20 then 'published'::public.article_status when 19 then 'archived'::public.article_status else 'draft'::public.article_status end,
          case when n in (19,20) then '2026-10-22T12:00:00Z'::timestamptz else null end,
          case n when 19 then '2026-10-22T13:00:00Z'::timestamptz else null end,'2026-10-22T12:00:00.123456Z'
        from generate_series(1,21) n;
        insert into public.articles(id,owner_profile_id,section_id,title,slug) values
          ('${id(22)}','${uuid(users.other)}','${id(99)}','${label} other private','${prefix}-other'),
          ('${id(23)}','${uuid(users.admin)}','${id(99)}','${label} admin own','${prefix}-admin');
      `);
      installed = true;
    },
    setupSelections() {
      if (!installed || suite !== "select")
        throw new Error("Not a selection fixture.");
      sql(`do $$ begin
        if exists(select 1 from public.sections where id='${id(98)}')
          or exists(select 1 from public.categories where id in ('${id(97)}','${id(96)}'))
          or exists(select 1 from public.tags where id='${id(95)}')
          or exists(select 1 from public.profiles where id='${id(94)}')
        then raise exception 'Reserved selection fixture IDs already exist'; end if;
      end $$;
      insert into public.sections(id,name,slug) values('${id(98)}','Synthetic ${project} select alternate','${prefix}-alternate');
        insert into public.categories(id,section_id,name,slug) values('${id(97)}','${id(99)}','Synthetic ${project} category','${prefix}-category'),('${id(96)}','${id(98)}','Synthetic ${project} alternate category','${prefix}-alternate-category');
        insert into public.tags(id,name,slug) values('${id(95)}','Synthetic ${project} topic','${prefix}-topic');
        insert into public.profiles(id,display_name,slug) values('${id(94)}','Synthetic ${project} guest','${prefix}-guest');`);
      selectionsInstalled = true;
    },
    setCategoryActive(active: boolean) {
      if (!installed || suite !== "select")
        throw new Error("Not a selection fixture.");
      sql(
        `update public.categories set active=${active ? "true" : "false"} where id='${id(97)}';`,
      );
    },
    selections() {
      if (!installed || suite !== "select")
        throw new Error("Not a selection fixture.");
      return JSON.parse(
        sql(`select jsonb_build_object(
        'categories',(select coalesce(jsonb_agg(category_id order by category_id),'[]') from public.article_categories where article_id='${id(21)}'),
        'tags',(select coalesce(jsonb_agg(tag_id order by tag_id),'[]') from public.article_tags where article_id='${id(21)}'),
        'credits',(select coalesce(jsonb_agg(jsonb_build_object('profileId',profile_id,'role',contribution_role,'displayOrder',display_order) order by profile_id,contribution_role),'[]') from public.article_contributors where article_id='${id(21)}'));`),
      );
    },
    creditOther() {
      if (!installed || suite !== "select")
        throw new Error("Not a selection fixture.");
      sql(
        `insert into public.article_contributors(article_id,profile_id,contribution_role) values('${id(21)}','${uuid(users.other)}','writer');`,
      );
    },
    failRead() {
      if (!installed) throw new Error("Fixture is not installed.");
      // PostgreSQL accepts infinity; our bounded summary contract deliberately rejects it.
      sql(`insert into public.articles(id,owner_profile_id,section_id,title,slug,updated_at)
        values('${id(24)}','${uuid(users.author)}','${id(99)}','Synthetic unsupported timestamp','${prefix}-read-failure','infinity');`);
    },
    recoverRead() {
      if (installed) sql(`delete from public.articles where id='${id(24)}';`);
    },
    article(number: number) {
      if (!installed || !Number.isInteger(number) || number < 1 || number > 24)
        throw new Error("Invalid fixture article.");
      return JSON.parse(
        sql(
          `select jsonb_build_object('article',to_jsonb(a),'revisions',(select count(*) from public.article_revisions r where r.article_id=a.id),'audits',(select count(*) from public.audit_events e where e.resource_id=a.id)) from public.articles a where a.id='${id(number)}';`,
        ),
      );
    },
    legacy() {
      if (!installed) throw new Error("Fixture is not installed.");
      sql(
        `update public.articles set content='{"format":"legacy","payload":"preserve synthetic legacy"}'::jsonb where id='${id(18)}';`,
      );
    },
    setSectionActive(active: boolean) {
      if (!installed) throw new Error("Fixture is not installed.");
      sql(
        `update public.sections set active=${active ? "true" : "false"} where id='${id(99)}';`,
      );
    },
    setCreateAccess(active: boolean) {
      if (!installed) throw new Error("Fixture is not installed.");
      sql(
        `update public.memberships set active=${active ? "true" : "false"},revoked_at=${active ? "null" : "now()"} where user_id='${uuid(users.empty)}';`,
      );
    },
    createdCount() {
      if (!installed) throw new Error("Fixture is not installed.");
      return Number(
        sql(
          `select count(*) from public.articles where owner_profile_id='${uuid(users.empty)}';`,
        ),
      );
    },
    created(slug: string) {
      if (
        !installed ||
        !/^[a-z0-9]+(-[a-z0-9]+)*$/u.test(slug) ||
        slug.length > 180
      )
        throw new Error("Invalid fixture lookup.");
      return JSON.parse(
        sql(`select jsonb_build_object('status',a.status,'excerpt',a.excerpt,'content',a.content,'seoKeyphrase',a.seo_keyphrase,'metaDescription',a.meta_description,'version',a.edit_version,
        'revisions',(select count(*) from public.article_revisions r where r.article_id=a.id),
        'audits',(select count(*) from public.audit_events e where e.resource_id=a.id),
        'receipts',(select count(*) from private.draft_write_receipts r where r.article_id=a.id))
        from public.articles a where a.slug='${slug}' and a.owner_profile_id='${uuid(users.empty)}';`),
      );
    },
    cleanup() {
      if (!installed) return;
      sql(`delete from private.draft_write_receipts where actor_user_id in (${quoted(userIds)});
        delete from private.draft_write_limits where actor_user_id in (${quoted(userIds)});
        delete from public.audit_events where actor_user_id in (${quoted(userIds)});
        delete from public.article_revisions where actor_user_id in (${quoted(userIds)});
        delete from public.article_categories where article_id in (select id from public.articles where owner_profile_id in (${quoted(userIds)}));
        delete from public.article_tags where article_id in (select id from public.articles where owner_profile_id in (${quoted(userIds)}));
        delete from public.article_contributors where article_id in (select id from public.articles where owner_profile_id in (${quoted(userIds)}));
        delete from public.articles where owner_profile_id in (${quoted(userIds)});
        ${
          selectionsInstalled
            ? `delete from public.categories where id in ('${id(97)}','${id(96)}');
        delete from public.tags where id='${id(95)}';
        delete from public.sections where id='${id(98)}';
        delete from public.profiles where id='${id(94)}';`
            : ""
        }
        delete from public.sections where id='${id(99)}';
        delete from public.memberships where user_id in (${quoted(userIds)});
        delete from public.profiles where id in (${quoted(userIds)});
        delete from auth.users where id in (${quoted(userIds)});`);
      installed = false;
      selectionsInstalled = false;
    },
  };
}
