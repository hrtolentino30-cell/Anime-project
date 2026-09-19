# HLS short-episode validation and queue fairness — 2026-09-19

The first Narumi's Week at Work E3 run remuxed two HLS candidates, rejected them
with a generic validation message, and then spent eight minutes on each of two
timestamp-discontinuous candidates. No Meta session was started.
The old short-episode exception handled declared MP4 only; all sub-five-minute
HLS files were rejected regardless of completeness. The old logs did not record
the rejected files' actual durations, so the precise cause is still pending
verification with the new diagnostics.

The new exception requires:
- An HLS response initiated from an iframe explicitly declared in the episode
  page's mirror options, or one of that iframe's descendants.
- A finite media playlist containing ENDLIST, at least three segments, and no
  missing-segment or iframe-only markers.
- Playlist length between 30 seconds and five minutes.
- Independent source ffprobe duration, output container duration, video stream
  duration, and audio stream duration all agreeing within two seconds.
- Existing video-resolution and audio/video checks still pass.

Malformed/master/live playlists, unknown player provenance, missing duration,
and truncated audio/video cannot pass the short-episode exception.
Metadata provenance does not independently establish copyright or episode identity.
Existing direct MP4 behavior is unchanged. The implementation follows HLS playlist
semantics documented at https://www.rfc-editor.org/rfc/rfc8216 .

Logs now include resolution, video/audio duration, and finite-playlist evidence
without logging signed media URLs or request credentials.
All eleven targeted Node tests passed.

The database claim order is now accepted-upload reconciliation, explicit priority,
fewest attempts, then oldest queue entry. This lets fresh episodes proceed before
an older failing download retries again. In-flight jobs are not interrupted.
A rollback-only database test confirmed Conan E1213 precedes the older Kaiju retry.
Per-episode claims, duplicate checks, release eligibility, and peak-hour capacity
remain unchanged. No website sync changes.

Live HLS short validation and publication are pending verification after deployment.
