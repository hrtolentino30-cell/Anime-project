create or replace function private.prune_sync_history()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_queue_completed integer := 0;
  v_queue_failed integer := 0;
  v_events integer := 0;
  v_runs integer := 0;
  v_cron integer := 0;
begin
  delete from public.sync_queue
  where status = 'completed'
    and completed_at is not null
    and completed_at < now() - interval '30 days';
  get diagnostics v_queue_completed = row_count;

  delete from public.sync_queue
  where status = 'failed'
    and updated_at < now() - interval '90 days';
  get diagnostics v_queue_failed = row_count;

  delete from public.sync_events
  where created_at < now() - interval '14 days';
  get diagnostics v_events = row_count;

  delete from public.sync_runs
  where finished_at is not null
    and finished_at < now() - interval '14 days';
  get diagnostics v_runs = row_count;

  delete from cron.job_run_details
  where end_time is not null
    and end_time < now() - interval '7 days';
  get diagnostics v_cron = row_count;

  return jsonb_build_object(
    'completed_queue_deleted', v_queue_completed,
    'failed_queue_deleted', v_queue_failed,
    'events_deleted', v_events,
    'runs_deleted', v_runs,
    'cron_runs_deleted', v_cron
  );
end;
$$;

revoke all on function private.prune_sync_history() from public, anon, authenticated;

do $$
declare
  v_jobid bigint;
begin
  for v_jobid in select jobid from cron.job where jobname = 'anime-sync-retention'
  loop
    perform cron.unschedule(v_jobid);
  end loop;
end $$;

select cron.schedule(
  'anime-sync-retention',
  '23 3 * * *',
  'select private.prune_sync_history();'
);
