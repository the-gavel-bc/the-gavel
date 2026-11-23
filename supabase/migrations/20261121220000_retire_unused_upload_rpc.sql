-- Explicit image removal and background cleanup no longer use the old list RPC.
drop function public.list_unused_article_uploads(uuid, uuid, integer) restrict;
