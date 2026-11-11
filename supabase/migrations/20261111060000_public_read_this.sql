-- A footer needs only its four cards. Slot allocation remains shared with the
-- full homepage so curated reservations and fallback order stay identical.
create function public.get_public_read_this()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare read_this uuid[]; cards jsonb;
begin
  select r.read_ids into read_this from private.resolve_homepage_slots() r;
  cards:=private.homepage_card_map(read_this);
  if cards is null then return jsonb_build_object('kind','unavailable'); end if;
  return jsonb_build_object('kind','ok','readThis',
    coalesce((select jsonb_agg(cards->id::text order by n)
      from unnest(read_this) with ordinality t(id,n)),'[]'::jsonb));
end;
$$;
revoke all on function public.get_public_read_this() from public,anon,authenticated;
grant execute on function public.get_public_read_this() to anon,authenticated;
