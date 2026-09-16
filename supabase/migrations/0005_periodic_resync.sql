create or replace function public.enqueue_stale_catalog()
returns jsonb
language plpgsql security definer set search_path=public as $$
declare a record; e record; anime_jobs int:=0; episode_jobs int:=0;
begin
  for a in select source_url,source_id from public.anime where lower(coalesce(status,'')) in ('ongoing','airing','currently airing') and coalesce(last_scraped_at,'epoch'::timestamptz) < now()-interval '6 hours' order by last_scraped_at nulls first limit 12
  loop perform public.enqueue_sync_job(a.source_url,a.source_id,'anime',60); anime_jobs:=anime_jobs+1; end loop;
  for e in select ep.source_url,ep.source_episode_id from public.episodes ep join public.anime a on a.id=ep.anime_id where (ep.air_date is null or ep.air_date > now()-interval '45 days') and lower(coalesce(a.status,'')) in ('ongoing','airing','currently airing') and coalesce(ep.last_scraped_at,'epoch'::timestamptz) < now()-interval '24 hours' order by ep.last_scraped_at nulls first limit 8
  loop perform public.enqueue_sync_job(e.source_url,e.source_episode_id,'episode',65); episode_jobs:=episode_jobs+1; end loop;
  return jsonb_build_object('anime',anime_jobs,'episodes',episode_jobs);
end $$;
revoke all on function public.enqueue_stale_catalog() from public,anon,authenticated;
grant execute on function public.enqueue_stale_catalog() to service_role;
