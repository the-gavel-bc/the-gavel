import { execFileSync } from "node:child_process";
import {
  clearAuditFixtureRows,
  lockAccountFixtureCleanup,
} from "../../../scripts/test-support/audit-fixture-cleanup";
import { dbContainer } from "../db-container/db-container";
import { localSupabase } from "../local-supabase/local-supabase";

// Synthetic members, one per role, and articles in each workflow state, for
// the role journey tests. IDs are reserved per Playwright project.
export function roleFixture(project: string) {
  const base = project === "mobile" ? 9720 : 9710;
  const users = {
    author: base + 1,
    other: base + 2,
    editor: base + 3,
    admin: base + 4,
  };
  const uuid = (n: number) =>
    `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const id = (n: number) =>
    `97000000-0000-0000-0000-${String(base * 100 + n).padStart(12, "0")}`;
  const userIds = Object.values(users).map(uuid);
  const quoted = (values: string[]) => values.map((v) => `'${v}'`).join(",");
  const prefix = `roles-${project}`;
  const body = `'{"format":"gavel-draft","version":1,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Role journey body."}]}]}}'::jsonb`;
  // n: 1 author draft (ready), 2 other author's article published by the
  // administrator, 3 author draft already in review.
  const articles = { draft: 1, published: 2, inReview: 3 };

  function sql(statement: string) {
    localSupabase();
    return execFileSync(
      "docker",
      [
        "exec",
        "-i",
        dbContainer(),
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
      { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    ).trim();
  }

  return {
    users,
    id,
    articles,
    slug: (n: number) => `${prefix}-${n}`,
    title: (n: number) =>
      `Role ${n === 1 ? "draft" : n === 2 ? "published" : "in review"} ${project}`,
    setup() {
      sql(`
        do $$ begin
          if exists(select 1 from auth.users where id in (${quoted(userIds)}))
            or exists(select 1 from public.sections where id='${id(99)}')
          then raise exception 'Reserved role fixture IDs already exist'; end if;
        end $$;
        insert into auth.users (id,instance_id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,encrypted_password,confirmation_token,recovery_token,email_change_token_new,email_change_token_current,email_change,phone_change,phone_change_token,reauthentication_token)
        select value::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
          'gavel-roles-' || right(value,4) || '@bc.edu',now(),'{"provider":"google","providers":["google"]}'::jsonb,'{}'::jsonb,now(),now(),'','','','','','','','',''
        from unnest(array[${quoted(userIds)}]) value;
        insert into public.profiles(id,auth_user_id,display_name,slug)
        select id,id,'Role ' || right(id::text,4),'${prefix}-member-' || right(id::text,4) from auth.users where id in (${quoted(userIds)});
        insert into public.memberships(user_id,role,active,approved_by,approved_at)
        select id,case id when '${uuid(users.admin)}' then 'administrator'::public.app_role
          when '${uuid(users.editor)}' then 'editor'::public.app_role else 'author'::public.app_role end,
          true,'${uuid(users.admin)}',now()
        from auth.users where id in (${quoted(userIds)});
        insert into public.sections(id,name,slug) values('${id(99)}','Role journeys ${project}','${prefix}');
        insert into public.articles(id,owner_profile_id,section_id,title,slug,content,status,published_at,published_by_profile_id,review_requested_at)
        values
          ('${id(1)}','${uuid(users.author)}','${id(99)}','Role draft ${project}','${prefix}-1',${body},'draft',null,null,null),
          ('${id(2)}','${uuid(users.other)}','${id(99)}','Role published ${project}','${prefix}-2',${body},'published',now() - interval '1 day','${uuid(users.admin)}',null),
          ('${id(3)}','${uuid(users.author)}','${id(99)}','Role in review ${project}','${prefix}-3',${body},'draft',null,null,now());
        insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,byte_size,width,height,sha256,finalized_at)
        select ('97100000-0000-0000-0000-' || lpad((${base} * 100 + n)::text,12,'0'))::uuid,
          ('97000000-0000-0000-0000-' || lpad((${base} * 100 + n)::text,12,'0'))::uuid,
          '${uuid(users.author)}',gen_random_uuid(),
          ('97000000-0000-0000-0000-' || lpad((${base} * 100 + n)::text,12,'0')) || '/' ||
          ('97100000-0000-0000-0000-' || lpad((${base} * 100 + n)::text,12,'0')) || '.webp',
          'finalized',120,12,8,repeat('a',64),now()
        from generate_series(1,3) n;
        insert into public.article_main_images(article_id,asset_id,alt_text,credit)
        select ('97000000-0000-0000-0000-' || lpad((${base} * 100 + n)::text,12,'0'))::uuid,
          ('97100000-0000-0000-0000-' || lpad((${base} * 100 + n)::text,12,'0'))::uuid,'Synthetic photo','The Gavel'
        from generate_series(1,3) n;
      `);
    },
    article(n: number) {
      const row =
        sql(`select row_to_json(a) from (select status::text,edit_version,review_requested_at,review_note,
        published_by_profile_id,correction from public.articles where id='${id(n)}') a;`);
      return JSON.parse(row || "null") as {
        status: string;
        edit_version: number;
        review_requested_at: string | null;
        review_note: string | null;
        published_by_profile_id: string | null;
        correction: string | null;
      } | null;
    },
    cleanup() {
      const owned = `(select id from public.articles where section_id='${id(99)}')`;
      sql(`${lockAccountFixtureCleanup}
        delete from public.article_main_images where article_id in ${owned};
        delete from private.article_revision_media_refs where article_id in ${owned};
        delete from public.media_assets where article_id in ${owned};
        delete from private.draft_write_receipts where actor_user_id in (${quoted(userIds)});
        delete from private.draft_write_limits where actor_user_id in (${quoted(userIds)});
        ${clearAuditFixtureRows(`actor_user_id in (${quoted(userIds)}) or resource_id in ${owned}`)}
        delete from public.article_revisions where article_id in ${owned};
        delete from public.article_contributors where article_id in ${owned};
        delete from private.media_cleanup_ledger where article_id in ${owned};
        delete from private.media_key_registry where article_id in ${owned};
        delete from private.article_id_registry where article_id in ${owned};
        delete from public.articles where section_id='${id(99)}';
        delete from public.sections where id='${id(99)}';
        delete from public.memberships where user_id in (${quoted(userIds)});
        delete from public.profiles where id in (${quoted(userIds)});
        delete from auth.users where id in (${quoted(userIds)});`);
    },
  };
}
