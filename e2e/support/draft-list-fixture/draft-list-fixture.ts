import { execFileSync } from "node:child_process";
import { localSupabase } from "../local-supabase/local-supabase";

export function draftListFixture(
  project: string,
  suite:
    | "list"
    | "create"
    | "edit"
    | "select"
    | "save"
    | "recover"
    | "media"
    | "bodyMedia"
    | "published"
    | "lifecycle"
    | "admin"
    | "audit"
    | "contributors"
    | "taxonomy"
    | "profile"
    | "deletion"
    | "site"
    | "homepage"
    | "members" = "list",
) {
  if (project !== "desktop" && project !== "mobile")
    throw new Error("Unknown local browser project.");
  const base =
    (project === "desktop" ? 860 : 880) +
    (suite === "deletion"
      ? 720
      : suite === "site"
        ? 680
        : suite === "homepage"
          ? 640
          : suite === "profile"
            ? 600
            : suite === "taxonomy"
              ? 560
              : suite === "contributors"
                ? 520
                : suite === "members"
                  ? 480
                  : suite === "audit"
                    ? 440
                    : suite === "admin"
                      ? 400
                      : suite === "lifecycle"
                        ? 360
                        : suite === "published"
                          ? 320
                          : suite === "bodyMedia"
                            ? 280
                            : suite === "media"
                              ? 240
                              : suite === "recover"
                                ? 200
                                : suite === "save"
                                  ? 160
                                  : suite === "select"
                                    ? 120
                                    : suite === "edit"
                                      ? 80
                                      : suite === "create"
                                        ? 40
                                        : 0);
  const prefix = `${suite === "deletion" ? "phase4-task15" : suite === "site" ? "phase4-task14" : suite === "homepage" ? "phase4-task13" : suite === "profile" ? "phase4-task12" : suite === "taxonomy" ? "phase4-task11" : suite === "contributors" ? "phase4-task10" : suite === "members" ? "phase4-task9" : suite === "audit" ? "phase4-task8" : suite === "admin" ? "phase4-task7" : suite === "lifecycle" ? "phase4-task6" : suite === "published" ? "phase4-task5" : suite === "bodyMedia" ? "phase4-task4" : suite === "media" ? "phase4-task3" : suite === "save" || suite === "recover" ? `task10-${suite}` : suite === "select" ? "task9" : suite === "edit" ? "task8" : suite === "create" ? "task7" : "task6"}-${project}`;
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
  const label = `Task ${suite === "deletion" ? "4.15" : suite === "site" ? "4.14" : suite === "homepage" ? "4.13" : suite === "contributors" ? "4.10" : suite === "members" ? "4.9" : suite === "audit" ? "4.8" : suite === "admin" ? "4.7" : suite === "lifecycle" ? "4.6" : suite === "published" ? "4.5" : suite === "bodyMedia" ? "4.4" : suite === "media" ? "4.3" : suite === "save" || suite === "recover" ? 10 : suite === "select" ? 9 : suite === "edit" ? 8 : suite === "create" ? 7 : 6} ${project}`;
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
    pendingMemberId: uuid(base + 5),
    pendingMemberEmail: `aaaa-task9-${project}@bc.edu`,
    id,
    label,
    topicName: `Synthetic ${project}${suite === "select" ? "" : ` ${suite}`} topic`,
    setup() {
      sql(`
        do $$ begin
          if exists(select 1 from auth.users where id in (${quoted(userIds)}))
            or exists(select 1 from public.profiles where id in (${quoted(userIds)}))
            or exists(select 1 from public.sections where id='${id(99)}')
            ${suite === "deletion" ? `or exists(select 1 from private.retired_article_slugs where slug='${prefix}-own-19')` : ""}
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
    prepareDeletionMedia() {
      if (!installed || suite !== "deletion")
        throw new Error("Not a deletion fixture.");
      sql(`insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status)
        values('${id(91)}','${id(19)}','${uuid(users.author)}','${id(92)}','${id(19)}/${id(91)}.webp','uploading');`);
    },
    ensureSiteUnset() {
      if (!installed || suite !== "site")
        throw new Error("Not a site fixture.");
      sql(`do $$ begin
        if not exists(select 1 from public.site_information where edit_version=1 and mission is null
          and contact_email is null and instagram_url is null and submission_instructions is null)
        then raise exception 'Site settings are not empty; refusing browser write'; end if;
      end $$;`);
    },
    makePublishedReady() {
      if (!installed || (suite !== "published" && suite !== "lifecycle"))
        throw new Error("Not a publication fixture.");
      const number = suite === "lifecycle" ? 21 : 20;
      sql(`
        update public.articles set content='{"format":"gavel-draft","version":1,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Published body."}]}]}}'::jsonb
          where id='${id(number)}';
        insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,
          byte_size,width,height,sha256,finalized_at)
          values('${id(91)}','${id(number)}','${uuid(users.author)}','${id(92)}',
            '${id(number)}/${id(91)}.webp','finalized',120,12,8,repeat('a',64),now());
        insert into public.article_main_images(article_id,asset_id,alt_text,credit)
          values('${id(number)}','${id(91)}','Synthetic newsroom','The Gavel');
      `);
    },
    makeArchivedReady() {
      if (!installed || suite !== "admin")
        throw new Error("Not an admin fixture.");
      sql(`
        update public.articles set content='{"format":"gavel-draft","version":1,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Archived story body."}]}]}}'::jsonb
          where id='${id(19)}';
        insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,
          byte_size,width,height,sha256,finalized_at)
          values('${id(91)}','${id(19)}','${uuid(users.author)}','${id(92)}',
            '${id(19)}/${id(91)}.webp','finalized',120,12,8,repeat('a',64),now());
        insert into public.article_main_images(article_id,asset_id,alt_text,credit)
          values('${id(19)}','${id(91)}','Synthetic newsroom','The Gavel');
      `);
    },
    seedAudit() {
      if (!installed || suite !== "audit")
        throw new Error("Not an audit fixture.");
      sql(`insert into public.audit_events(id,actor_user_id,action,resource_type,resource_id,created_at)
        select ('86000000-0000-0000-0000-' || lpad((${base * 100}+80+n)::text,12,'0'))::uuid,
          '${uuid(users.author)}','article.archived','article','${id(19)}',
          now() + interval '1 year' + n * interval '1 second'
        from generate_series(1,22) n;`);
    },
    seedPendingMember() {
      if (!installed || suite !== "members")
        throw new Error("Not a membership fixture.");
      sql(`insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
        values('${uuid(base + 5)}','aaaa-task9-${project}@bc.edu',now(),
          '{"provider":"google","providers":["google"]}'::jsonb,'{}'::jsonb);`);
    },
    prepareHomepage() {
      if (!installed || suite !== "homepage" || project !== "desktop")
        throw new Error("Not a writable homepage fixture.");
      sql(`do $$ begin
        if exists(select 1 from public.homepage_selections) or exists(select 1 from public.homepage_curation where edit_version<>1)
          then raise exception 'Homepage curation is not empty; refusing to overwrite data'; end if;
      end $$;
      update public.articles set status='published',published_at=now() where id='${id(21)}';`);
    },
    setAdminAccess(active: boolean) {
      if (!installed || (suite !== "admin" && suite !== "audit"))
        throw new Error("Not an admin fixture.");
      sql(
        `update public.memberships set active=${active ? "true" : "false"},revoked_at=${active ? "null" : "now()"} where user_id='${uuid(users.admin)}';`,
      );
    },
    setupSelections() {
      if (
        !installed ||
        (suite !== "select" &&
          suite !== "save" &&
          suite !== "recover" &&
          suite !== "taxonomy")
      )
        throw new Error("Not a selection fixture.");
      sql(`do $$ begin
        if exists(select 1 from public.sections where id='${id(98)}')
          or exists(select 1 from public.categories where id in ('${id(97)}','${id(96)}'))
          or exists(select 1 from public.tags where id='${id(95)}')
          or exists(select 1 from public.profiles where id='${id(94)}')
        then raise exception 'Reserved selection fixture IDs already exist'; end if;
      end $$;
      insert into public.sections(id,name,slug) values('${id(98)}','Synthetic ${project} ${suite} alternate','${prefix}-alternate');
        insert into public.categories(id,section_id,name,slug) values('${id(97)}','${id(99)}','Synthetic ${project} category','${prefix}-category'),('${id(96)}','${id(98)}','Synthetic ${project} alternate category','${prefix}-alternate-category');
        insert into public.tags(id,name,slug) values('${id(95)}','Synthetic ${project}${suite === "select" ? "" : ` ${suite}`} topic','${prefix}-topic');
        insert into public.profiles(id,display_name,slug) values('${id(94)}','Synthetic ${project} guest','${prefix}-guest');`);
      selectionsInstalled = true;
    },
    setCategoryActive(active: boolean) {
      if (
        !installed ||
        (suite !== "select" && suite !== "save" && suite !== "recover")
      )
        throw new Error("Not a selection fixture.");
      sql(
        `update public.categories set active=${active ? "true" : "false"} where id='${id(97)}';`,
      );
    },
    selections(number = 21) {
      if (
        !installed ||
        (suite !== "select" && suite !== "save" && suite !== "recover")
      )
        throw new Error("Not a selection fixture.");
      if (!Number.isInteger(number) || number < 1 || number > 24)
        throw new Error("Invalid fixture article.");
      return JSON.parse(
        sql(`select jsonb_build_object(
        'categories',(select coalesce(jsonb_agg(category_id order by category_id),'[]') from public.article_categories where article_id='${id(number)}'),
        'tags',(select coalesce(jsonb_agg(tag_id order by tag_id),'[]') from public.article_tags where article_id='${id(number)}'),
        'credits',(select coalesce(jsonb_agg(jsonb_build_object('profileId',profile_id,'role',contribution_role,'displayOrder',display_order) order by profile_id,contribution_role),'[]') from public.article_contributors where article_id='${id(number)}'));`),
      );
    },
    creditOther() {
      if (
        !installed ||
        (suite !== "select" && suite !== "save" && suite !== "recover")
      )
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
      if (installed)
        sql(
          `delete from public.articles where id='${id(24)}'; delete from private.article_id_registry where article_id='${id(24)}';`,
        );
    },
    article(number: number) {
      if (!installed || !Number.isInteger(number) || number < 1 || number > 24)
        throw new Error("Invalid fixture article.");
      return JSON.parse(
        sql(
          `select jsonb_build_object('article',to_jsonb(a),'revisions',(select count(*) from public.article_revisions r where r.article_id=a.id),'audits',(select count(*) from public.audit_events e where e.resource_id=a.id),'receipts',(select count(*) from private.draft_write_receipts r where r.article_id=a.id)) from public.articles a where a.id='${id(number)}';`,
        ),
      );
    },
    legacy() {
      if (!installed) throw new Error("Fixture is not installed.");
      sql(
        `update public.articles set content='{"format":"legacy","payload":"preserve synthetic legacy"}'::jsonb where id='${id(18)}';`,
      );
    },
    legacyPublished() {
      if (!installed || suite !== "lifecycle")
        throw new Error("Not a lifecycle fixture.");
      sql(
        `update public.articles set content='{"format":"legacy","payload":"preserve synthetic legacy"}'::jsonb where id='${id(20)}';`,
      );
    },
    setSectionActive(active: boolean) {
      if (!installed) throw new Error("Fixture is not installed.");
      sql(
        `update public.sections set active=${active ? "true" : "false"} where id='${id(99)}';`,
      );
    },
    setAuthorAccess(active: boolean) {
      if (!installed || (suite !== "save" && suite !== "recover"))
        throw new Error("Not a save fixture.");
      sql(
        `update public.memberships set active=${active ? "true" : "false"},revoked_at=${active ? "null" : "now()"} where user_id='${uuid(users.author)}';`,
      );
    },
    makeReadOnly(number: number) {
      if (
        !installed ||
        (suite !== "save" && suite !== "recover") ||
        !Number.isInteger(number) ||
        number < 1 ||
        number > 24
      )
        throw new Error("Not a save fixture article.");
      sql(
        `update public.articles set status='archived',published_at=now(),archived_at=now() where id='${id(number)}';`,
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
      if (suite === "site")
        sql(`do $$ begin
          if exists(select 1 from private.site_information_receipts where actor_user_id in (${quoted(userIds)})) then
            if exists(select 1 from public.site_information where edit_version=2 and mission='Synthetic Task 14 browser mission' and contact_email is null and instagram_url is null and submission_instructions is null) then
              update public.site_information set mission=null,edit_version=1 where id='00000000-0000-0000-0000-000000000002';
            else raise exception 'Site settings changed outside the browser fixture; refusing cleanup'; end if;
          end if;
        end $$;
        delete from private.site_information_receipts where actor_user_id in (${quoted(userIds)});`);
      if (suite === "members")
        sql(`delete from private.membership_write_receipts where target_user_id='${uuid(base + 5)}';
          delete from public.audit_events where resource_type='membership' and resource_id='${uuid(base + 5)}';
          delete from public.memberships where user_id='${uuid(base + 5)}';
          delete from public.profiles where auth_user_id='${uuid(base + 5)}';
          delete from auth.users where id='${uuid(base + 5)}';`);
      sql(`${
        suite === "media" ||
        suite === "bodyMedia" ||
        suite === "published" ||
        suite === "lifecycle" ||
        suite === "admin" ||
        suite === "deletion"
          ? `
        -- Test-only synthetic cleanup; production removes objects via Storage API.
        select set_config('storage.allow_delete_query','true',true);
        delete from storage.objects where bucket_id='article-media' and name in
          (select object_key from public.media_assets where uploader_user_id in (${quoted(userIds)}));
        delete from public.article_main_images where article_id in
          (select id from public.articles where owner_profile_id in (${quoted(userIds)}));
        delete from private.media_write_receipts where actor_user_id in (${quoted(userIds)});
        delete from private.article_revision_media_refs where article_id in
          (select id from public.articles where owner_profile_id in (${quoted(userIds)}));
        delete from public.article_body_images where article_id in
          (select id from public.articles where owner_profile_id in (${quoted(userIds)}));
        delete from public.media_assets where uploader_user_id in (${quoted(userIds)});
      `
          : ""
      }
        ${suite === "deletion" ? `delete from private.media_cleanup_ledger where article_id='${id(19)}'; delete from private.media_key_registry where article_id='${id(19)}'; delete from private.retired_article_ids where article_id='${id(19)}'; delete from private.article_id_registry where article_id='${id(19)}'; delete from private.article_deletion_receipts where actor_user_id in (${quoted(userIds)}); delete from private.retired_article_slugs where slug='${prefix}-own-19';` : ""}
        delete from private.draft_write_receipts where actor_user_id in (${quoted(userIds)});
        delete from private.profile_write_receipts where actor_user_id in (${quoted(userIds)});
        delete from private.taxonomy_write_receipts where actor_user_id in (${quoted(userIds)});
        delete from private.homepage_write_receipts where actor_user_id in (${quoted(userIds)});
        delete from private.draft_write_limits where actor_user_id in (${quoted(userIds)});
        delete from public.audit_events where actor_user_id in (${quoted(userIds)});
        delete from public.article_revisions where actor_user_id in (${quoted(userIds)});
        delete from public.article_categories where article_id in (select id from public.articles where owner_profile_id in (${quoted(userIds)}));
        delete from public.article_tags where article_id in (select id from public.articles where owner_profile_id in (${quoted(userIds)}));
        delete from public.article_contributors where article_id in (select id from public.articles where owner_profile_id in (${quoted(userIds)}));
        ${
          suite === "homepage"
            ? `do $$ begin
          if exists(select 1 from public.homepage_selections where article_id in
            (select id from public.articles where owner_profile_id in (${quoted(userIds)}))) then
            delete from public.homepage_selections where article_id in
              (select id from public.articles where owner_profile_id in (${quoted(userIds)}));
            if not exists(select 1 from public.homepage_selections) then
              update public.homepage_curation set edit_version=1; end if;
          end if;
        end $$;`
            : ""
        }
        delete from private.media_cleanup_ledger where article_id in (select id from public.articles where owner_profile_id in (${quoted(userIds)}));
        delete from private.media_key_registry where article_id in (select id from public.articles where owner_profile_id in (${quoted(userIds)}));
        delete from private.article_id_registry where article_id in (select id from public.articles where owner_profile_id in (${quoted(userIds)}));
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
        ${suite === "contributors" ? `delete from public.profiles where auth_user_id is null and slug in ('task-ten-guest-${project}','task-ten-edited-${project}');` : ""}
        delete from public.memberships where user_id in (${quoted(userIds)});
        delete from public.profiles where id in (${quoted(userIds)});
        delete from auth.users where id in (${quoted(userIds)});`);
      installed = false;
      selectionsInstalled = false;
    },
  };
}
