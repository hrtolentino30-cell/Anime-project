-- Mirrors production hardening applied 2026-09-18.
create or replace function public.analytics_admin_summary(p_days integer default 30)
returns jsonb language plpgsql security definer set search_path='public' as $$
declare v jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.admin_users where user_id=auth.uid()) then raise exception 'insufficient_privilege' using errcode='42501'; end if;
 with e as (select * from public.analytics_events where created_at>=now()-make_interval(days=>greatest(1,least(p_days,365)))),
 sessions as (select session_id,min(created_at) first_at,max(created_at) last_at from e group by session_id),
 plays as (select count(*) filter(where event_name='play_start') starts,count(*) filter(where event_name='play_complete') completes from e)
 select jsonb_build_object('events',(select count(*) from e),'sessions',(select count(*) from sessions),'users',(select count(distinct user_id) from e where user_id is not null),'anime_views',(select count(*) from e where event_name='anime_view'),'play_starts',(select starts from plays),'play_completes',(select completes from plays),'completion_rate',coalesce((select round(100.0*completes/nullif(starts,0),1) from plays),0),'avg_session_minutes',coalesce((select round(avg(extract(epoch from(last_at-first_at))/60.0)::numeric,1) from sessions),0)) into v; return v;
end $$;
revoke all on function public.analytics_admin_summary(integer) from public,anon;
grant execute on function public.analytics_admin_summary(integer) to authenticated;
drop policy if exists "search_events_admin_read" on public.search_events;
create policy "search_events_admin_read" on public.search_events for select to authenticated using (exists(select 1 from public.admin_users a where a.user_id=auth.uid()));
create or replace function public.search_admin_summary(p_days integer default 30) returns jsonb language plpgsql security definer set search_path='public' as $$
declare v jsonb; begin
 if auth.uid() is null or not exists(select 1 from public.admin_users where user_id=auth.uid()) then raise exception 'insufficient_privilege' using errcode='42501'; end if;
 select jsonb_build_object('searches',count(*),'zero_results',count(*) filter(where result_count=0),'zero_result_rate',coalesce(round(100.0*count(*) filter(where result_count=0)/nullif(count(*),0),1),0),'top_queries',coalesce((select jsonb_agg(x) from (select lower(query) query,count(*) searches,round(avg(result_count),1) avg_results from public.search_events where created_at>=now()-make_interval(days=>greatest(1,least(p_days,90))) group by lower(query) order by count(*) desc limit 20)x),'[]'::jsonb)) into v from public.search_events where created_at>=now()-make_interval(days=>greatest(1,least(p_days,90))); return v; end $$;
revoke all on function public.search_admin_summary(integer) from public,anon;
grant execute on function public.search_admin_summary(integer) to authenticated;