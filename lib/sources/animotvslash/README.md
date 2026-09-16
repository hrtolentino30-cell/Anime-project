# AnimeTVSlash adapter

The production scraper runs in Supabase Edge Functions under `supabase/functions/_shared/sources/animotvslash`.
It deliberately centralizes all AnimeTVSlash-specific URL classification, metadata parsing, episode parsing and video-source discovery there. The Next.js frontend never contacts the upstream source.

Observed source structure (verified 2026-09-16):
- catalog/detail: `/anime/<slug>/`
- episodes: `/<anime-slug>-episode-<number>/`
- lightweight discovery: homepage, `/schedule/`, `/anime/list-mode/`, and the update/add ordering views
- anime detail pages expose Status/Studio/Released/Season/Type and `Released on` / `Updated on` labels plus episode links
- episode pages expose multiple named server choices; the video parser supports direct iframe/source URLs, data attributes, inline HLS/MP4 URLs and common WordPress dynamic-player AJAX markup
