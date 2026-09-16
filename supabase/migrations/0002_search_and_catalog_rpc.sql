create or replace function public.search_anime(p_query text, p_limit int default 20)
returns table (
  id uuid, slug text, title text, title_english text, title_japanese text,
  poster_url text, type text, status text, year int, rating numeric, latest_episode numeric, rank real
)
language sql stable set search_path=public, extensions as $$
  with q as (select nullif(trim(p_query),'') query)
  select a.id,a.slug,a.title,a.title_english,a.title_japanese,a.poster_url,a.type,a.status,a.year,a.rating,a.latest_episode,
    greatest(
      similarity(lower(a.title), lower(q.query)),
      similarity(lower(coalesce(a.title_english,'')), lower(q.query)),
      similarity(lower(coalesce(a.title_japanese,'')), lower(q.query)),
      coalesce((select max(similarity(t.normalized_title, lower(q.query))) from public.anime_titles t where t.anime_id=a.id),0)
    )::real as rank
  from public.anime a, q
  where q.query is not null and (
    a.title % q.query or coalesce(a.title_english,'') % q.query or coalesce(a.title_japanese,'') % q.query
    or exists(select 1 from public.anime_titles t where t.anime_id=a.id and t.normalized_title % lower(q.query))
  )
  order by rank desc, a.title asc
  limit greatest(1,least(p_limit,50));
$$;
grant execute on function public.search_anime(text,int) to anon, authenticated;
