# Facebook release gate and peak workers — 2026-09-19

## Scope
Facebook queue admission, claim/reservation checks, and uploader workflow only.
No website importer, website schedule, anime/episode metadata, or AnimePahe changes.

## Why catalog episodes reached Facebook
The source labels newly added catalog episodes with today's “Released on” date.
The importer stores that as air_date. The old three-day date filter did not verify
the original episode release, and positive priority bypassed the date check.
This change does not alter shared metadata or claim to recover original broadcast dates.

## Conservative eligibility
Only ongoing/currently-airing series with a recent source date and their latest known
episode are admitted automatically. Completed or unknown-status series, older episode
numbers, and three or more stored episodes sharing the same source date are held with
queue status ignored and a release_gate reason. Series start year is deliberately not
used: a long-running show can have a new episode.

Checks run at queue admission, job claim, and immediately before a new Meta session
is reserved. Priority and explicit episode_url do not bypass them.
Existing accepted uploads are reconciled using their existing video IDs.
Partial unaccepted uploads are not automatically resumed against a newly remuxed file.

This is a conservative metadata gate, not an independent broadcast-date service:
incorrect upstream status/latest metadata can still misclassify a repost.
Legitimate finales and batch premieres may be held for review. Ignored rows are not
automatically reopened; review their release evidence before changing eligibility.
No published Facebook posts were removed.

Immediate containment blocked Desert Punk E24 and BEASTARS Parts 1/2 E12 before
upload started. Dr. Stone Science Future Cour 2 E12 had already been accepted and
was marked published at 2026-09-19 07:16:33 UTC.

## Parallel workers
The existing workflow path and OIDC identity are preserved.
At workflow start, 13:00–17:59 UTC (21:00–01:59 PHT) selects two matrix jobs.
Outside that window, or for an explicitly requested episode, one job is selected.
Jobs already running can finish after the peak window closes.

Each matrix job has its own GitHub-hosted runner, filesystem, process, queue lease,
and Meta session. The existing global workflow concurrency group serializes workflow
runs, so overlapping schedule/push/manual triggers cannot multiply the worker pool.
cancel-in-progress=false and matrix fail-fast=false prevent one job canceling another.
Schedule remains every ten minutes; discovery scheduling is untouched.
The per-job 24-minute timeout remains below the 25-minute queue lease expiry.

Database claim transactions retain the advisory lock plus FOR UPDATE SKIP LOCKED,
and exclude other active/upload-started rows for the same canonical anime+episode.
The lock is held only while assigning jobs, not during media transfer.
Attempt numbers fence writes from obsolete worker attempts.
Parallel publishing can finish out of order; it is not strict FIFO.
GitHub runner usage can increase; no new paid service was introduced.

## Verification
- Eight SQL eligibility cases passed in a rollback transaction and after deployment.
- Two eligible jobs received distinct leases; a second claim of the same job returned
  null; a stale attempt was rejected; reserving one job did not mutate the other.
- Completed-title queue admission and reservation were rejected even at priority 99.
- All integration-test reservations were rolled back; no test media was published.
- Three Node tests cover PHT peak boundaries, explicit episode requests, invalid dates.
- New SQL functions execute only for service_role; no security advisor findings named
  the new functions.
- Full simultaneous media uploads during peak hours have not yet been observed.
