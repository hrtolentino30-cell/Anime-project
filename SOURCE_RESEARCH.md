# AnimeTVSlash source research

Observed against `https://animotvslash.org/` on 2026-09-16.

Stable routes observed: anime `/anime/<slug>/`, episodes `/<anime-slug>-episode-<number>/`, schedule `/schedule/`, season `/season/`, list mode `/anime/list-mode/`, and update/added browse surfaces.

Anime pages expose title, alternate/Japanese titles, status, studio, release/updated metadata, genres, synopsis, artwork and episode links. Episode pages expose parent anime links, dates and multiple player/server groups.

The recurring scanner only reads lightweight release/update/schedule surfaces. It fingerprints stable link/title/artwork/date fields and periodically resyncs bounded ongoing/recent records to catch metadata/player changes not visible on index pages. Full list-mode enumeration is bootstrap-only.
