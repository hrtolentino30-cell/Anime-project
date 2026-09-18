create or replace function public.search_anime(p_query text,p_limit integer default 20)
returns table(id uuid,slug text,title text,title_english text,title_japanese text,poster_url text,type text,status text,year integer,rating numeric,latest_episode numeric,rank real)
language sql stable set search_path=public,extensions as $$
with q as (select lower(regexp_replace(trim(p_query),'\s+',' ','g')) query),
base as (
 select a.id,a.slug,a.title,a.title_english,a.title_japanese,a.poster_url,a.type,a.status,a.year,a.rating,a.latest_episode,q.query
 from public.anime a cross join q where length(q.query)>=2
), scored as (
 select b.*,greatest(
 case when lower(b.title)=b.query then 2.0 else 0 end,
 case when lower(coalesce(b.title_english,''))=b.query then 1.95 else 0 end,
 case when lower(coalesce(b.title_japanese,''))=b.query then 1.95 else 0 end,
 case when lower(b.title) like b.query||'%' then 1.65 else 0 end,
 case when lower(coalesce(b.title_english,'')) like b.query||'%' then 1.6 else 0 end,
 case when lower(b.title) like '%'||b.query||'%' then 1.25 else 0 end,
 extensions.similarity(lower(b.title),b.query),
 extensions.similarity(lower(coalesce(b.title_english,'')),b.query),
 extensions.similarity(lower(coalesce(b.title_japanese,'')),b.query),
 extensions.word_similarity(b.query,lower(b.title))*1.15,
 extensions.word_similarity(b.query,lower(coalesce(b.title_english,'')))*1.1,
 coalesce((select max(greatest(case when t.normalized_title=b.query then 1.9 else 0 end,case when t.normalized_title like b.query||'%' then 1.55 else 0 end,extensions.similarity(t.normalized_title,b.query),extensions.word_similarity(b.query,t.normalized_title)*1.1)) from public.anime_titles t where t.anime_id=b.id),0)
 )::real rank from base b
)
select id,slug,title,title_english,title_japanese,poster_url,type,status,year,rating,latest_episode,rank from scored
where rank>.22 order by rank desc,coalesce(rating,0) desc,title asc limit greatest(1,least(p_limit,50))
$$;
grant execute on function public.search_anime(text,integer) to anon,authenticated;
