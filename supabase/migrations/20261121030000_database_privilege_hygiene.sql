begin;
set local lock_timeout = '5s';

-- These postgres-owned tables are internal to checked RPCs. Keep owner access
-- for the existing definer functions and add no direct-access policies.
alter table private.article_deletion_receipts enable row level security;
alter table private.article_id_registry enable row level security;
alter table private.homepage_write_receipts enable row level security;
alter table private.media_cleanup_ledger enable row level security;
alter table private.media_cleanup_probe enable row level security;
alter table private.media_cleanup_runtime enable row level security;
alter table private.media_key_registry enable row level security;
alter table private.membership_invitations enable row level security;
alter table private.membership_write_receipts enable row level security;
alter table private.profile_write_receipts enable row level security;
alter table private.retired_article_ids enable row level security;
alter table private.retired_article_slugs enable row level security;
alter table private.site_information_receipts enable row level security;
alter table private.taxonomy_write_receipts enable row level security;

-- postgres creates application objects. Leave the platform owner's defaults
-- and all explicit grants on existing objects under their current ownership.
alter default privileges for role postgres in schema public, private
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public, private
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public, private
  revoke all on functions from public, anon, authenticated;

-- Per-schema revokes cannot override PostgreSQL's global default EXECUTE.
alter default privileges for role postgres
  revoke execute on functions from public, anon, authenticated;

-- The active worker already uses cleanup run leases and the newer scan RPCs.
drop function public.record_media_cleanup_health(boolean) restrict;
drop function public.register_retired_media_key(uuid, uuid, uuid) restrict;
drop function public.finish_retired_article_scan(uuid, uuid, integer, boolean) restrict;

commit;
