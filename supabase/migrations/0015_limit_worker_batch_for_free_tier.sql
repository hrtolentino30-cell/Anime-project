create or replace function public.claim_sync_jobs(p_limit int default 3)
returns setof public.sync_queue
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.sync_queue q
  set status='processing', started_at=now(), updated_at=now(), attempts=q.attempts+1
  where q.id in (
    select sq.id from public.sync_queue sq
    where sq.status='pending' and sq.available_at <= now()
    order by sq.priority asc, sq.created_at asc
    for update skip locked
    limit greatest(1, least(p_limit,3))
  )
  returning q.*;
end
$$;
revoke all on function public.claim_sync_jobs(int) from public, anon, authenticated;
grant execute on function public.claim_sync_jobs(int) to service_role;
