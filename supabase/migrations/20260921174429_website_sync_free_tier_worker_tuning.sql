create or replace function public.claim_sync_jobs(p_limit integer default 3)
returns setof public.sync_queue
language plpgsql
set search_path to ''
as $$
begin
 return query
 with picked as (
  select q.id
  from public.sync_queue q
  left join public.source_items s on s.source_url=q.source_url
  where q.status='pending'
    and q.available_at<=now()
    and q.attempts<q.max_attempts
  order by q.priority asc,
           case when q.priority=0 then s.created_at end desc nulls last,
           q.created_at asc,
           q.id
  for update of q skip locked
  limit greatest(1,least(p_limit,8))
 )
 update public.sync_queue q
 set status='processing',
     started_at=now(),
     updated_at=now(),
     attempts=q.attempts+1
 from picked
 where q.id=picked.id
 returning q.*;
end
$$;

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname='anime-sync-worker'),
  schedule := '* * * * *'
);
