-- Lists every stored file of one user, so the guest cleanup can delete them through the Storage API
-- (rows in storage.objects must not be deleted directly). Service role only.
create or replace function public.user_storage_paths(p_user uuid)
returns table(bucket text, name text)
language sql security definer set search_path = '' stable as $$
  select o.bucket_id::text, o.name::text from storage.objects o
   where (storage.foldername(o.name))[1] = p_user::text
$$;
revoke all on function public.user_storage_paths(uuid) from public, anon, authenticated;
