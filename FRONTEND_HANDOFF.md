# Animori frontend handoff

This branch owns the frontend presentation and discovery experience. It is based on `main` at `616f69899eb7bf3c4a61a7db0e2d1fd86465e410`.

## Workstream boundaries

- Frontend: `app/` page presentation, `components/`, styles, navigation, search interaction, and catalog browsing.
- Backend worker: `supabase/`, migrations, ingestion, queue, source extraction, credentials, and the server data functions in `lib/data.ts`.
- Brand asset worker: final logo and icon exports. `components/Brand.tsx` is a temporary text lockup and an integration point; it is not a replacement master logo.

No backend functions, tables, policies, credentials, synchronization jobs, or playback persistence were changed. No new package dependencies are required. This branch does not change the production branch or deployment settings.

## Changes

- Charcoal, ivory, and muted crimson presentation based on the approved identity board.
- Active desktop and mobile navigation, a desktop search form, larger touch targets, and a keyboard skip link.
- Readable catalog shelves with horizontal scrolling instead of hiding entries at mobile breakpoints.
- Search query URLs, request cancellation, protection from stale results, accessible loading feedback, empty results, and retry states.
- Browse filters with visible labels, reset, sort options, exact result counts, and pagination (36 per page).
- Shared page loading UI and visitor-facing errors. Rating-sorted recent anime are labeled “Highly rated”; ongoing titles are labeled “Airing now”.

## Existing backend contracts consumed

| Feature | Existing API or relation | Expectations |
| --- | --- | --- |
| Home | `getHomeData()` in `lib/data.ts` | `updatedAnime`, `latestEpisodes`, `seasonal`, `movies`, `completed`, `continuing` |
| Search | `search_anime(p_query, p_limit)` | `p_query` is a trimmed string, `p_limit` is 24; rows include `id`, `slug`, `title`, optional `poster_url`, `title_japanese`, `type`, `year` |
| Browse | `anime` | Public select of `id`, `slug`, `title`, `poster_url`, `type`, `status`, `year`, `rating`, `updated_at`; filter on `season`; exact count and range supported |
| Genre filter | `genres`, `anime_genres` | `genres(id,name,slug)`, `anime_genres(genre_id,anime_id)` |
| Studio filter | `studios`, `anime_studios` | `studios(id,name,slug)`, `anime_studios(studio_id,anime_id)` |
| Navigation | Existing Supabase SSR auth | Only a signed-in boolean is reflected by the server-rendered navigation; no credentials or user object are passed to client navigation |
| Detail and watch | Existing `getAnimeBySlug()` and `getWatchData()` | Existing routes, sources, player, auth, favorites, and progress logic remain compatible |

Browse query parameters: `genre`, `studio`, `year`, `season`, `status`, `type`, `sort=updated|rating|title`, `page`. Search accepts `/search?q=...`. Applying filters resets pagination; page links preserve selected filters. Invalid genre/studio slugs produce an empty selection rather than an unfiltered catalog.

## Parallel work

The separate ChatGPT conversations do not share a direct messaging channel. Use this branch and its pull request as the handoff. Merge backend changes normally, then check for overlapping edits to `app/` or `components/` before merging the frontend branch. Coordinate changes to the contracts above in this file or the PR.

## Verification

- TypeScript check passed.
- Existing seven repository tests passed.
- Production build passed on Next.js 16.3.5, installed within the existing package ranges.
- Public catalog read succeeded using the existing publishable credentials.
- Browser review completed against the Vercel preview: home render, live search, empty search, browse filters, pagination, navigation, and no horizontal overflow at the available viewport were verified. Responsive CSS and touch target rules were also reviewed.

Authenticated favorites/progress writes and actual video availability are outside this frontend pass; playback and login implementations were preserved.
