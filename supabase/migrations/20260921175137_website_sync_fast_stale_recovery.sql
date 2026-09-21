create or replace function public.recover_stale_sync_jobs(p_age interval default '3 minutes'::interval)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare n int;
begin
  update public.sync_queue
  set status='pending',
      started_at=null,
      available_at=now(),
      updated_at=now(),
      last_error=coalesce(last_error,'') || E'\nRecovered stale processing job.'
  where status='processing'
    and started_at < now() - p_age
    and attempts < max_attempts;
  get diagnostics n = row_count;
  return n;
end
$$;

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname='anime-sync-worker'),
  schedule := '* * * * *'
);
