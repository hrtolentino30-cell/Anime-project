revoke select on table public.anime from anon, authenticated;
grant select (id,slug,title,title_english,title_japanese,description,poster_url,banner_url,type,status,season,year,rating,duration,latest_episode,total_episodes,source_updated_at,created_at,updated_at) on table public.anime to anon, authenticated;
revoke select on table public.episodes from anon, authenticated;
grant select (id,anime_id,episode_number,title,thumbnail_url,air_date,created_at,updated_at) on table public.episodes to anon, authenticated;
