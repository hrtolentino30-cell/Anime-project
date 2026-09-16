# Private upstream source research

Verified 2026-09-16 against the authorized private source configured in Supabase Vault.

Stable route patterns observed include anime `/anime/<slug>/`, episodes `/<anime-slug>-episode-<number>/`, schedule `/schedule/`, season `/season/`, list mode `/anime/list-mode/`, and update/added browse surfaces.

Anime pages expose titles, status, studios, release metadata, genres, synopsis, artwork and episode links. Episode pages expose parent anime links, dates and multiple player/server groups.

The recurring scanner reads only lightweight release/update/schedule surfaces. It fingerprints stable link/title/artwork/date fields and periodically resyncs bounded recent records. Full list-mode enumeration is bootstrap-only.
