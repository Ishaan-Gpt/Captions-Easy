-- Videos and exports now live on users' devices; anything still in storage older than N days is cleaned up daily.
-- Service role only.
create or replace function public.old_storage_objects(p_days int default 7, p_limit int default 1000)
returns table(bucket text, name text)
language sql security definer set search_path = '' stable as $$
  select o.bucket_id::text, o.name::text from storage.objects o
   where o.bucket_id in ('media', 'videos') and o.created_at < now() - make_interval(days => p_days)
   order by o.created_at
   limit p_limit
$$;
revoke all on function public.old_storage_objects(int, int) from public, anon, authenticated;
