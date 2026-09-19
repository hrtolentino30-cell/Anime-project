-- Run against the deployed database; no mutations are persisted.
BEGIN;
DO $test$
DECLARE t timestamptz:='2026-09-19T07:00:00Z'; actual text;
BEGIN
 IF public.facebook_release_block_reason('Completed',24,24,t,1,t) IS NULL THEN RAISE EXCEPTION 'Completed archive admitted'; END IF;
 IF public.facebook_release_block_reason(NULL,1,1,t,1,t) IS NULL THEN RAISE EXCEPTION 'Unknown status admitted'; END IF;
 IF public.facebook_release_block_reason('Ongoing',1,12,t,1,t) IS NULL THEN RAISE EXCEPTION 'Old episode admitted'; END IF;
 IF public.facebook_release_block_reason('Ongoing',12,12,t,12,t) IS NULL THEN RAISE EXCEPTION 'Batch backfill admitted'; END IF;
 IF public.facebook_release_block_reason('Ongoing',12,12,t-interval '5 days',1,t) IS NULL THEN RAISE EXCEPTION 'Stale date admitted'; END IF;
 IF public.facebook_release_block_reason('Ongoing',12,12,NULL,1,t) IS NULL THEN RAISE EXCEPTION 'Missing date admitted'; END IF;
 IF public.facebook_release_block_reason('Ongoing',150,150,t,1,t) IS NOT NULL THEN RAISE EXCEPTION 'New episode of long-running series blocked'; END IF;
 IF public.facebook_release_block_reason('Ongoing',12.5,12.5,t,1,t) IS NOT NULL THEN RAISE EXCEPTION 'New fractional episode blocked'; END IF;
END $test$;

ROLLBACK;
