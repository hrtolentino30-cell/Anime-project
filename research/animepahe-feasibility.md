# AnimePahe Facebook-only feasibility — 2026-09-19

Decision: NOT READY to switch. Production source remains unchanged.

## Verified in this investigation
- Exact current main revision: fd8903b56427f1bd799b348cc975fb926ebbd510.
- The existing scripts/animepahe-probe.mjs fails node --check at line 4:
  a literal backslash-n separates the bases declaration and browser launch.
  Node reports SyntaxError: Invalid or unexpected token.
- The old probe requires the live detector URL and MEDIA_BRIDGE_SECRET and POSTs
  discovered items. It is not a safe read-only feasibility test.
- It collects arbitrary homepage anchors into the same list as episode candidates,
  so its discovered count does not demonstrate usable episode discovery.
- This environment's HTTPS GET to https://animepahe.pw/ returned HTTP 403 with
  Cloudflare's “Sorry, you have been blocked” page.
- The independent cloud browser rendered the same security block. One normal
  reload did not resolve it. No CAPTCHA control was offered. Further site probing
  stopped; no domain rotation, proxy switching, or challenge bypass was attempted.
- Existing source-bridge/README.md confirms the extension sends episode metadata
  after manual browsing; it does not export media. It is not a cloud-only solution.
- No new GitHub runner test, episode-media download, or Facebook publish was completed.
  Earlier GitHub failures retrieved from conversation history are historical
  evidence, not fresh tests from this investigation.

## Isolated diagnostic
research/animepahe-readonly.mjs is standalone, has no credentials, uses GET only,
and never calls Supabase or Facebook. It has no workflow or schedule.
It stops on denied access, never follows cross-origin redirects, rejects empty or
malformed feeds, and always reports ready_for_switch=false. The airing schema and
play URL construction come from the previous implementation and remain unverified
against current live data; synthetic tests do not establish live compatibility.

Offline checks:
    node --check research/animepahe-readonly.mjs
    node --test research/animepahe-readonly.test.mjs

Once access is legitimately available, a manual diagnostic can use:
    node research/animepahe-readonly.mjs

Exit 0 means discovery only. It does NOT mean media or publishing works.
No active pipeline code, workflows, database rows, publication ledger,
credentials, or website-sync settings were modified.

## Required evidence before a later switch
1. Repeatable access from the intended free cloud runner with no manual session
   renewal; obtain supported access or an operator-approved feed if blocked.
2. Accurate new-release identities and pagination, with a future-only baseline.
3. Several complete episode downloads with verified duration, audio, resolution,
   and retry behavior; discovery alone is insufficient.
4. Canonical title/season/episode matching against the existing publication ledger,
   including fractional episodes and cross-source duplicates.
5. Facebook-only candidate storage and media resolution; website records and
   website importer remain unchanged. Current discovery still matches canonical
   episode rows, so changing just a hostname would not complete the migration.
6. An explicit controlled publishing test only after source tests pass, followed by
   a reviewable switch and rollback plan preserving existing publication history.

The adapter work is bounded. Unattended source access is the unresolved dependency;
no reliable free cloud path has been demonstrated by this investigation.
