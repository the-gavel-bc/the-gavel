import { lockAccountFixtureCleanup } from "../../scripts/test-support/audit-fixture-cleanup";
import { dbContainer } from "../support/db-container/db-container";
import { execFileSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import sharp from "sharp";
import type { BrowserContext } from "@playwright/test";
const workdir = process.env.METADATA_BROWSER_WORKDIR;
if (workdir && workdir !== "/private/tmp/gavel-task20-browser")
  throw new Error("Unexpected metadata browser project");
const container = dbContainer(
  workdir ? "supabase_db_gavel-task20-browser" : undefined,
);
export const scratch = Boolean(workdir);
export function sql(statement: string) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-XAtq",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}
const local = () =>
  JSON.parse(
    execFileSync(
      "pnpm",
      [
        "exec",
        "supabase",
        "status",
        ...(workdir ? ["--workdir", workdir] : []),
        "-o",
        "json",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  );
export async function createFixture(project: string) {
  const prefix = `metadata-${project}`;
  const base = project === "desktop" ? 1000 : 2000;
  const id = (n: number) =>
    `8b000000-0000-0000-0000-${String(base + n).padStart(12, "0")}`;
  const user = `00000000-0000-0000-0000-${String(5201 + base).padStart(12, "0")}`;
  const status = local();
  const bytes = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "#abcdef" },
  })
    .webp()
    .toBuffer();
  const key = `${id(1)}/${id(201)}.webp`;
  sql(`begin;do $$ begin if exists(select 1 from public.sections where slug='${prefix}') or exists(select 1 from auth.users where id='${user}') then raise exception 'Metadata fixture collision';end if;end $$;
    insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,encrypted_password,confirmation_token,recovery_token,email_change_token_new,email_change_token_current,email_change,phone_change,phone_change_token,reauthentication_token)
    values('${user}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','${prefix}@bc.edu',now(),'{"provider":"google","providers":["google"]}','{}',now(),now(),'','','','','','','','','');
    insert into public.profiles(id,auth_user_id,display_name,slug,biography)values('${id(301)}','${user}','Metadata Writer ${project}','${prefix}-writer','Public biography.');
    insert into public.memberships(user_id,role,active,approved_by,approved_at)values('${user}','author',true,'00000000-0000-0000-0000-000000000004',now());
    insert into public.sections(id,name,slug)values('${id(101)}','Metadata News ${project}','${prefix}');
    insert into public.categories(id,section_id,name,slug)values('${id(102)}','${id(101)}','Campus','campus');
    insert into public.tags(id,name,slug)values('${id(103)}','Metadata Topic ${project}','${prefix}-topic');
    insert into public.articles(id,owner_profile_id,section_id,title,slug,excerpt,meta_description,content,status,published_at,archived_at)
    select ('8b000000-0000-0000-0000-'||lpad((${base}+n)::text,12,'0'))::uuid,'${id(301)}','${id(101)}',
      case when n=3 then 'PRIVATE DRAFT SECRET' when n=4 then 'PRIVATE ARCHIVE SECRET' else 'Metadata title '||n end,'${prefix}-story-'||n,'Public excerpt.','Description with "quotes" & literal text.',
      case when n=5 then null else '{"format":"gavel-draft","version":1,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Published body."}]}]}}'::jsonb end,
      case when n=3 then 'draft'::public.article_status when n=4 then 'archived'::public.article_status else 'published'::public.article_status end,
      case when n!=3 then '2026-11-10T00:00:00.123456Z'::timestamptz else null end,case when n=4 then now() else null end from generate_series(1,17)n;
    insert into public.article_categories(article_id,category_id,section_id)values('${id(1)}','${id(102)}','${id(101)}');
    insert into public.article_tags(article_id,tag_id)values('${id(1)}','${id(103)}');
    insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,byte_size,width,height,sha256,finalized_at)values('${id(201)}','${id(1)}','${user}','${id(202)}','${key}','finalized',${bytes.length},8,8,'${createHash("sha256").update(bytes).digest("hex")}',now());
    insert into public.article_main_images(article_id,asset_id,alt_text,credit)values('${id(1)}','${id(201)}','Synthetic campus','Synthetic credit');commit;`);
  const fixture = {
    prefix,
    id,
    async signIn(context: BrowserContext) {
      const encode = (value: unknown) =>
        Buffer.from(JSON.stringify(value)).toString("base64url");
      const now = Math.floor(Date.now() / 1000);
      const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ iss: `${status.API_URL}/auth/v1`, sub: user, aud: "authenticated", role: "authenticated", iat: now, exp: now + 3600 })}`;
      const token = `${unsigned}.${createHmac("sha256", status.JWT_SECRET).update(unsigned).digest("base64url")}`;
      const session = {
        access_token: token,
        refresh_token: "synthetic-unused-refresh-token",
        expires_in: 3600,
        expires_at: now + 3600,
        token_type: "bearer",
        user: { id: user },
      };
      await context.addCookies([
        {
          name: "sb-127-auth-token",
          value: `base64-${encode(session)}`,
          domain: "127.0.0.1",
          path: "/",
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ]);
    },
    async cleanup() {
      const removed = await fetch(
        `${status.API_URL}/storage/v1/object/article-media`,
        {
          method: "DELETE",
          headers: {
            apikey: status.SERVICE_ROLE_KEY,
            Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ prefixes: [key] }),
        },
      );
      if (!removed.ok) throw new Error("Synthetic image cleanup failed");
      sql(
        `begin;${lockAccountFixtureCleanup}delete from public.article_main_images where article_id in(select id from public.articles where slug like '${prefix}-story-%');delete from public.media_assets where id='${id(201)}';delete from private.media_cleanup_ledger where asset_id='${id(201)}';delete from private.media_key_registry where asset_id='${id(201)}';delete from public.article_tags where tag_id='${id(103)}';delete from public.article_categories where category_id='${id(102)}';delete from private.article_id_registry where article_id in(select id from public.articles where slug like '${prefix}-story-%');delete from public.articles where slug like '${prefix}-story-%';delete from public.categories where id='${id(102)}';delete from public.tags where id='${id(103)}';delete from public.sections where id='${id(101)}';delete from public.memberships where user_id='${user}';delete from public.profiles where id='${id(301)}';delete from auth.users where id='${user}';commit;`,
      );
    },
  };
  try {
    const upload = await fetch(
      `${status.API_URL}/storage/v1/object/article-media/${key}`,
      {
        method: "POST",
        headers: {
          apikey: status.SERVICE_ROLE_KEY,
          Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
          "Content-Type": "image/webp",
          "cache-control": "no-store",
        },
        body: new Uint8Array(bytes),
      },
    );
    if (!upload.ok) throw new Error("Synthetic public image upload failed");
    return fixture;
  } catch (error) {
    await fixture.cleanup();
    throw error;
  }
}
