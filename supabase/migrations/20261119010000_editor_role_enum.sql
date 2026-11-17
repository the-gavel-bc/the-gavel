-- Third staff role. Enum additions must commit before use, so this stands alone.
alter type public.app_role add value if not exists 'editor';
