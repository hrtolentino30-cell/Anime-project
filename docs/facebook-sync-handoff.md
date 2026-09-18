# Facebook sync handoff — 2026-09-18

## Verified production result

- Legend After My 10 Year-Long Last Stand episode 12: https://www.facebook.com/reel/1076588045295522/ — published=true, video_status=ready, all Meta phases complete. GitHub run 35359257752 succeeded. Media: 1920x1080, 1420.155 seconds, AAC, 696401730 bytes.
- Frontier Lord Begins with Zero Subjects episode 12: https://www.facebook.com/reel/859448280493576/ — published=true, video_status=ready, all Meta phases complete. GitHub run 35360068491 succeeded. Media: 1920x1080, 1420.061 seconds, AAC.
- Both episodes completed on the first new-worker attempt. A rolled-back claim test returned null for both published episodes.
- Smoking Behind the Supermarket episode 11: legacy run 35353256872 accepted video 4570709826547901, then timed out while Meta was processing. Its queue row now retains that video ID and finish_accepted=true so recovery verifies the existing video and never starts another. Check current queue/ledger for reconciliation result. Existing duplicate posts have not been deleted.

## Root causes and fixes

1. Import timestamps were mistaken for source release dates, allowing May catalog backfill to starve September releases. The trigger now requires a recent air_date, handles date updates, and explicit requested episodes have priority.
2. The resolver clicked only the outer page. It now activates embedded players, waits for HLS, validates full-length audio/video, and encodes audio to AAC.
3. Failures left processing claims behind. Queue attempts are fenced, pre-upload retries bounded, and stale claims recovered conservatively.
4. Upload sessions and video IDs were not durable. The proxy reserves before Meta start, records the session before transfer, and distinguishes accepted uploads from unsafe ambiguous failures.
5. Upload acceptance was confused with publication. Completion now requires published=true and video_status=ready; timeouts reconcile the same video.
6. The old publisher remained callable after its cron was disabled. It now returns 410. The legacy Facebook source monitor is manual-only. AnimePahe remains without a schedule.
7. The deployed scanner used an older source revision. Version 10 now includes pages 2 and 3; the 15:00 UTC scan checked 214 entries, queued 50 catalog updates, and returned zero errors.

## Operations

Repository: hrtolentino30-cell/Anime-project. Supabase project: agiqhqnqkiagnabbczyf.
Cloud worker: .github/workflows/animotvslash-media-probe.yml; schedule every 10 minutes, serial concurrency.
Proxy: facebook-upload-proxy version 8, GitHub OIDC restricted to the exact main-branch workflow.
Schema change source: db/facebook-upload-reliability.sql. Applied through separately named Supabase migrations.
Inspect facebook_episode_queue fields status, attempts, last_error, destination_video_id, upload_started, finish_accepted, upload_bytes, file_bytes, progress_at, meta_status, checked_at.
Canonical deduplication ledger: facebook_episode_publications keyed by anime_id and episode_number.
Do not discard upload state or reset an ambiguous job blindly. Reconcile an accepted video, or review an unconfirmed session first.
The failed historical backfill rows are intentionally excluded records, not active work.

Audio validation does not guarantee that Facebook will never mute content for rights claims. No attempt was made to evade platform enforcement.
