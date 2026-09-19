-- Integration check: requires two eligible, unstarted pending jobs. Does not call Meta.
-- All lease/reservation changes are rolled back.
BEGIN;
DO $test$
DECLARE first_url text; second_url text; first_job jsonb; second_job jsonb; blocked_job jsonb; stale_rejected boolean:=false; archived_id uuid;
BEGIN
 SELECT q.episode_url INTO first_url FROM public.facebook_episode_queue q
 WHERE q.status='pending' AND NOT q.upload_started AND q.attempts<3
 AND public.facebook_episode_release_block_reason(q.episode_id) IS NULL ORDER BY q.created_at LIMIT 1 FOR UPDATE;
 SELECT q.episode_url INTO second_url FROM public.facebook_episode_queue q
 WHERE q.status='pending' AND NOT q.upload_started AND q.attempts<3 AND q.episode_url<>first_url
 AND public.facebook_episode_release_block_reason(q.episode_id) IS NULL ORDER BY q.created_at LIMIT 1 FOR UPDATE;
 IF first_url IS NULL OR second_url IS NULL THEN RAISE EXCEPTION 'Need two eligible pending jobs for isolated claim test'; END IF;
 first_job:=public.claim_facebook_upload(first_url);
 second_job:=public.claim_facebook_upload(second_url);
 IF first_job IS NULL OR second_job IS NULL OR first_job->>'episode_id'=second_job->>'episode_id' THEN RAISE EXCEPTION 'Workers did not receive separate jobs'; END IF;
 IF public.claim_facebook_upload(first_url) IS NOT NULL THEN RAISE EXCEPTION 'Duplicate claim allowed'; END IF;
 BEGIN
  PERFORM public.facebook_upload_transition((first_job->>'episode_id')::uuid,(first_job->>'attempts')::integer+1,'reserve');
 EXCEPTION WHEN raise_exception THEN stale_rejected:=true;
 END;
 IF NOT stale_rejected THEN RAISE EXCEPTION 'Stale attempt allowed'; END IF;
 PERFORM public.facebook_upload_transition((first_job->>'episode_id')::uuid,(first_job->>'attempts')::integer,'reserve');
 IF (SELECT upload_started FROM public.facebook_episode_queue WHERE episode_id=(second_job->>'episode_id')::uuid) THEN RAISE EXCEPTION 'Worker 1 mutated worker 2'; END IF;
 SELECT q.episode_id INTO archived_id FROM public.facebook_episode_queue q JOIN public.episodes e ON e.id=q.episode_id
 JOIN public.anime a ON a.id=e.anime_id WHERE q.episode_url LIKE '%desert-punk-episode-24%' LIMIT 1;
 UPDATE public.facebook_episode_queue SET status='pending',priority=99 WHERE episode_id=archived_id;
 IF (SELECT status FROM public.facebook_episode_queue WHERE episode_id=archived_id)<>'ignored' THEN RAISE EXCEPTION 'Queue admission failed to hold archive'; END IF;
 IF public.claim_facebook_upload((SELECT episode_url FROM public.facebook_episode_queue WHERE episode_id=archived_id)) IS NOT NULL THEN RAISE EXCEPTION 'Priority bypassed release gate'; END IF;
 -- Also verify the final pre-upload gate if metadata changed after a claim.
 UPDATE public.facebook_episode_queue SET status='processing',attempts=1 WHERE episode_id=archived_id;
 stale_rejected:=false;
 BEGIN
  PERFORM public.facebook_upload_transition(archived_id,1,'reserve');
 EXCEPTION WHEN raise_exception THEN stale_rejected:=true;
 END;
 IF NOT stale_rejected THEN RAISE EXCEPTION 'Reserve accepted archive'; END IF;
END $test$;

ROLLBACK;
