-- Facebook-only conservative release admission. Does not modify anime/episodes or website sync.
CREATE OR REPLACE FUNCTION public.facebook_release_block_reason(
 p_series_status text,p_episode numeric,p_latest numeric,p_source_date timestamptz,
 p_same_day_count integer,p_reference timestamptz DEFAULT now()
) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE
  WHEN lower(trim(coalesce(p_series_status,''))) NOT IN ('ongoing','currently airing','airing')
   THEN 'Completed or unconfirmed airing status: original release requires review'
  WHEN p_source_date IS NULL OR p_source_date<p_reference-interval '3 days' OR p_source_date>p_reference+interval '1 day'
   THEN 'Missing or stale source date'
  WHEN p_episode IS NULL OR p_episode<=0 OR p_latest IS NULL OR p_episode<>p_latest
   THEN 'Not the latest known episode'
  WHEN coalesce(p_same_day_count,0)>=3
   THEN 'Multiple episodes dated together: possible catalog backfill'
  ELSE NULL
 END;
$$;

CREATE OR REPLACE FUNCTION public.facebook_episode_release_block_reason(p_episode_id uuid)
RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce((
  SELECT public.facebook_release_block_reason(
   a.status,e.episode_number,
   greatest(a.latest_episode,(SELECT max(x.episode_number) FROM public.episodes x WHERE x.anime_id=e.anime_id)),
   e.air_date,
   (SELECT count(*)::integer FROM public.episodes x
    WHERE x.anime_id=e.anime_id
    AND (x.air_date AT TIME ZONE 'UTC')::date=(e.air_date AT TIME ZONE 'UTC')::date)
  )
  FROM public.episodes e JOIN public.anime a ON a.id=e.anime_id WHERE e.id=p_episode_id
 ),CASE WHEN EXISTS(SELECT 1 FROM public.episodes e JOIN public.anime a ON a.id=e.anime_id WHERE e.id=p_episode_id)
        THEN NULL ELSE 'Episode or anime metadata missing' END);
$$;

CREATE OR REPLACE FUNCTION public.guard_facebook_queue_release()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE reason text;
BEGIN
 IF NEW.status='pending' AND NOT NEW.upload_started AND NOT NEW.finish_accepted THEN
  reason:=public.facebook_episode_release_block_reason(NEW.episode_id);
  IF reason IS NOT NULL THEN
   NEW.status:='ignored';
   NEW.last_error:='release_gate: '||reason;
   NEW.claimed_at:=NULL;
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_facebook_queue_release ON public.facebook_episode_queue;
CREATE TRIGGER trg_guard_facebook_queue_release
BEFORE INSERT OR UPDATE OF status ON public.facebook_episode_queue
FOR EACH ROW EXECUTE FUNCTION public.guard_facebook_queue_release();

CREATE OR REPLACE FUNCTION public.claim_facebook_upload(p_episode_url text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare q public.facebook_episode_queue%rowtype; result jsonb;
begin
 perform pg_advisory_xact_lock(hashtext('facebook-upload-claim'));
 update public.facebook_episode_queue f set status=case when f.upload_started and not f.finish_accepted then 'failed' when f.attempts>=3 and not f.finish_accepted then 'failed' else 'pending' end,last_error='Previous worker lease expired',claimed_at=null
 where f.status='processing' and f.claimed_at<now()-interval '25 minutes';
 update public.facebook_episode_queue f
 set status='ignored',claimed_at=null,last_error='release_gate: '||public.facebook_episode_release_block_reason(f.episode_id)
 where f.status='pending' and not f.upload_started and not f.finish_accepted
 and public.facebook_episode_release_block_reason(f.episode_id) is not null;
 select f.* into q from public.facebook_episode_queue f join public.episodes e on e.id=f.episode_id
 where f.status='pending' and (p_episode_url is null or f.episode_url=p_episode_url)
 and (f.finish_accepted or (not f.upload_started and public.facebook_episode_release_block_reason(e.id) is null))
 and (f.attempts<3 or f.finish_accepted)
 and not exists(select 1 from public.facebook_episode_publications p where p.anime_id=e.anime_id and p.episode_number=e.episode_number)
 and not exists(select 1 from public.facebook_episode_queue other join public.episodes oe on oe.id=other.episode_id
 where oe.anime_id=e.anime_id and oe.episode_number=e.episode_number and other.episode_id<>f.episode_id
 and (other.status in ('processing','published') or other.upload_started))
 order by f.priority desc,f.created_at for update of f skip locked limit 1;
 if not found then return null; end if;
 update public.facebook_episode_queue set status='processing',claimed_at=now(),attempts=attempts+1
 where episode_id=q.episode_id returning to_jsonb(facebook_episode_queue.*) into result;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.facebook_upload_transition(p_episode_id uuid, p_attempt integer, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare q public.facebook_episode_queue%rowtype; e public.episodes%rowtype; existing text;
begin
 select * into q from public.facebook_episode_queue where episode_id=p_episode_id for update;
 if not found or q.status<>'processing' or q.attempts<>p_attempt then raise exception 'Upload lease is no longer current'; end if;
 if p_action='reserve' then
  if q.upload_started then raise exception 'Upload already started; reconcile existing video'; end if;
  if public.facebook_episode_release_block_reason(p_episode_id) is not null then
   raise exception 'Episode is held by Facebook release gate: %', public.facebook_episode_release_block_reason(p_episode_id);
  end if;
  select * into e from public.episodes where id=p_episode_id for update;
  if exists(select 1 from public.facebook_episode_publications p where p.anime_id=e.anime_id and p.episode_number=e.episode_number)
   then raise exception 'Episode already published'; end if;
  update public.facebook_episode_queue set upload_started=true where episode_id=p_episode_id;
 elsif p_action='session' then
  if not q.upload_started or q.destination_video_id is not null or coalesce(p_data->>'video_id','')!~'^[0-9]+$' then raise exception 'Invalid upload session'; end if;
  update public.facebook_episode_queue set destination_video_id=p_data->>'video_id',upload_session_id=p_data->>'upload_session_id' where episode_id=p_episode_id;
 elsif p_action='accepted' then
  if q.destination_video_id is null then raise exception 'Missing video'; end if;
  update public.facebook_episode_queue set finish_accepted=true where episode_id=p_episode_id;
 elsif p_action='complete' then
  if not q.finish_accepted or q.destination_video_id is distinct from p_data->>'video_id' then raise exception 'Video mismatch'; end if;
  select * into e from public.episodes where id=p_episode_id for update;
  select destination_video_id into existing from public.facebook_episode_publications where anime_id=e.anime_id and episode_number=e.episode_number;
  if existing is not null and existing<>q.destination_video_id then raise exception 'Conflicting publication'; end if;
  insert into public.facebook_episode_publications(anime_id,episode_number,destination_video_id,destination_url,source_name,published_at)
  values(e.anime_id,e.episode_number,q.destination_video_id,p_data->>'url','animotvslash',now())
  on conflict(anime_id,episode_number) do nothing;
  update public.facebook_episode_queue set status='published',published_at=now(),last_error=null where episode_id=p_episode_id;
 elsif p_action='fail' then
  update public.facebook_episode_queue set
  status=case when coalesce((p_data->>'terminal')::boolean,false) then 'failed' when q.finish_accepted and q.attempts<6 and coalesce((p_data->>'terminal')::boolean,false)=false then 'pending'
              when not q.upload_started and q.attempts<3 then 'pending' else 'failed' end,
  claimed_at=null,last_error=left(p_data->>'error',1000) where episode_id=p_episode_id;
 else raise exception 'Unknown transition'; end if;
 return (select to_jsonb(f.*) from public.facebook_episode_queue f where episode_id=p_episode_id);
end $function$;

REVOKE ALL ON FUNCTION public.facebook_release_block_reason(text,numeric,numeric,timestamptz,integer,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.facebook_episode_release_block_reason(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.guard_facebook_queue_release() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.facebook_release_block_reason(text,numeric,numeric,timestamptz,integer,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.facebook_episode_release_block_reason(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_facebook_queue_release() TO service_role;
UPDATE public.facebook_episode_queue q
SET status='ignored',claimed_at=NULL,last_error='release_gate: '||public.facebook_episode_release_block_reason(q.episode_id)
WHERE q.status='pending' AND NOT q.upload_started AND NOT q.finish_accepted
 AND public.facebook_episode_release_block_reason(q.episode_id) IS NOT NULL;
