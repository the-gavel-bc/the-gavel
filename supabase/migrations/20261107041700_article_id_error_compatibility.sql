-- Preserve the existing referential-integrity error contract for ID changes.
create or replace function private.keep_article_id_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if new.id is distinct from old.id then raise exception 'Article ID is immutable' using errcode='23503'; end if;
 return new;
end $$;
