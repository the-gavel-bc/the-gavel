-- With one-off credits there is no contributor directory to administer.
-- Member profiles are edited by their owners (save_own_profile); credit-only
-- rows are created by the editor and have no management surface.
drop function public.list_admin_contributors(integer,text,text,uuid);
drop function public.save_contributor_profile(uuid,integer,uuid,text,text);
drop function public.deactivate_contributor_profile(uuid,integer,uuid);
drop function private.manage_contributor_profile(text,uuid,integer,uuid,text,text);
