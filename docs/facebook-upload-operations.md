# Facebook upload operations

The sole publisher is `.github/workflows/animotvslash-media-probe.yml`, scheduled every 10 minutes. It authenticates to `facebook-upload-proxy` using GitHub OIDC restricted to this workflow on main. The former publisher returns HTTP 410; the legacy Facebook source monitor is manual-only. AnimePahe scheduling remains disabled.

The website scanner discovers upstream releases and the episode trigger queues source dates within the last three days. Import time is not release time. Updates to a previously missing air_date can enqueue an existing episode. Explicit requested jobs use queue priority. The existing scanner now includes pages 2 and 3.

Queue attempts are fenced by episode ID and attempt number. Before Meta start, the server durably reserves the job. The returned upload session and video ID are stored before transfer. Ambiguous starts/transfers are failed for review, never automatically reuploaded. Accepted uploads that time out are reconciled by checking the same Facebook video. Completion requires published=true and video_status=ready. The canonical publication ledger keys anime_id and episode_number.

Inspect facebook_episode_queue.last_error for failures. Do not reset upload_started or discard destination_video_id to retry: first reconcile the existing video in Meta. Pre-upload failures retry at most three times. Manual URL input only claims an existing eligible queue job; it cannot bypass deduplication.

Media must include >=480p video, >=5 minutes duration, and full-length audio. AAC encoding improves compatibility but cannot prevent platform rights-related muting. No media alterations to evade rights enforcement are performed.

Validation: live-database tests in rolled-back transactions covered priority, duplicate starts, stale attempts, ambiguous failure, accepted-upload recovery, completion, and publication deduplication. End-to-end cloud verification must additionally confirm a published video permalink.
