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
  limit greatest(1,least(p_limit,16))
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

create or replace function public.enqueue_catalog_integrity_repairs(p_limit integer default 4)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  item record;
  queued_count integer:=0;
  missing_count integer:=0;
begin
  for item in
    select a.source_url,a.source_id,a.total_episodes,count(e.id)::integer as stored_episodes
    from public.anime a
    left join public.episodes e on e.anime_id=a.id
    where a.total_episodes is not null
      and a.total_episodes>0
      and a.source_url is not null
      and a.source_id is not null
    group by a.id,a.source_url,a.source_id,a.total_episodes,a.updated_at
    having count(e.id)<a.total_episodes
    order by (a.total_episodes-count(e.id)) desc,a.updated_at desc
    limit greatest(1,least(coalesce(p_limit,4),12))
  loop
    perform public.enqueue_sync_job(item.source_url,item.source_id,'anime'::public.sync_item_type,1);
    queued_count:=queued_count+1;
    missing_count:=missing_count+greatest(0,item.total_episodes::integer-item.stored_episodes);
  end loop;
  return jsonb_build_object('queued',queued_count,'missing_episodes',missing_count);
end
$$;

revoke all on function public.enqueue_catalog_integrity_repairs(integer) from public;
grant execute on function public.enqueue_catalog_integrity_repairs(integer) to service_role;

select cron.alter_job(job_id := (select jobid from cron.job where jobname='anime-sync-worker'),schedule := '* * * * *');
select cron.alter_job(job_id := (select jobid from cron.job where jobname='anime-sync-source-verifier'),schedule := '*/5 * * * *');
select cron.alter_job(job_id := (select jobid from cron.job where jobname='anime-sync-playback-health'),schedule := '*/3 * * * *');
