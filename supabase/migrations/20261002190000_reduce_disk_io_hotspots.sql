-- Reduce free-tier disk I/O from the two hottest scheduler queries.
-- 1) Source verifier: fetch the oldest active sources without sorting the
--    entire video_sources table to a temporary file every five minutes.
create index if not exists video_sources_active_verify_due_idx
on public.video_sources (last_verified_at asc nulls first)
where is_active = true;

-- 2) Worker overlap guard: unfinished runs are rare, so keep a tiny partial
--    index instead of scanning the full sync_runs history every 30 seconds.
create index if not exists sync_runs_active_recent_idx
on public.sync_runs (run_type, started_at desc)
where finished_at is null;
