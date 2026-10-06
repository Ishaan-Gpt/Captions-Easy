-- Projects are deleted 24 hours after creation (owner decision, 2026-10-04). Child tables cascade.
create or replace function public.delete_expired_projects(p_hours int default 24, p_limit int default 500)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with gone as (
    select id from projects where created_at < now() - make_interval(hours => p_hours) order by created_at limit p_limit
  ), del as (
    delete from projects where id in (select id from gone) returning 1
  )
  select count(*) into n from del;
  return n;
end $$;
revoke all on function public.delete_expired_projects(int, int) from public, anon, authenticated;

select cron.schedule('capseasy-expire-projects', '5 * * * *', $$select public.delete_expired_projects(24, 500)$$);
