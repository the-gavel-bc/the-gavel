import { execFileSync } from "node:child_process";
import { localSupabase } from "../support/local-supabase/local-supabase";
export default function setup() {
  localSupabase();
  // Only fixed synthetic rows in the local Docker project are changed. No email is sent.
  execFileSync(
    "docker",
    [
      "exec",
      "supabase_db_the-gavel",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `
    update auth.users set instance_id = '00000000-0000-0000-0000-000000000000', aud = 'authenticated', role = 'authenticated',
      email = 'gavel-foundation-' || right(id::text, 1) || '@bc.edu',
      email_confirmed_at = now(), created_at = now(), updated_at = now(),
      raw_app_meta_data = '{"provider":"google","providers":["google"]}'::jsonb
    where id in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004');
    insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data)
    values ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gavel-foundation-pending@bc.edu', now(), '{"provider":"google","providers":["google"]}'::jsonb)
    on conflict (id) do nothing;
    update auth.users set instance_id = '00000000-0000-0000-0000-000000000000', aud = 'authenticated', role = 'authenticated', email_confirmed_at = now(),
      raw_app_meta_data = '{"provider":"google","providers":["google"]}'::jsonb
    where id = '00000000-0000-0000-0000-000000000003';
    update auth.users set instance_id = '00000000-0000-0000-0000-000000000000',
      created_at = now(), updated_at = now(), raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb),
      confirmation_token = '', recovery_token = '',
      email_change_token_new = '', email_change_token_current = '', email_change = '',
      phone_change = '', phone_change_token = '', reauthentication_token = '', encrypted_password = ''
    where id in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004',
      '00000000-0000-0000-0000-000000000005');
  `,
    ],
    { stdio: "pipe" },
  );
}
