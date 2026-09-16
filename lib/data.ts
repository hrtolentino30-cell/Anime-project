import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function getHomeData(){
  const db=await createSupabaseServerClient();
  const [updated,latest,seasonal,movies,completed,userResult]=await Promise.all([
    db.from('anime').select('*').order('updated_at',{ascending:false}).limit(24),
    db.from('episodes').select('id,episode_number,title,air_date,anime:anime_id(id,slug,title,poster_url,type)').order('created_at',{ascending:false}).limit(16),
    db.from('anime').select('*').ilike('status','%ongoing%').order('updated_at',{ascending:false}).limit(12),
    db.from('anime').select('*').ilike('type','%movie%').order('updated_at',{ascending:false}).limit(12),
    db.from('anime').select('*').ilike('status','%complete%').order('updated_at',{ascending:false}).limit(12),
    db.auth.getUser(),
  ]);
  let continuing:any[]=[];
  const user=userResult.data.user;
  if(user){
    const {data}=await db.from('continue_watching').select('*').eq('user_id',user.id).order('updated_at',{ascending:false}).limit(12);
    continuing=data??[];
  }
  return {updatedAnime:updated.data??[],latestEpisodes:latest.data??[],seasonal:seasonal.data??[],movies:movies.data??[],completed:completed.data??[],continuing};
}

export async function getAnimeBySlug(slug:string){
  const db=await createSupabaseServerClient();
  const {data:anime,error}=await db.from('anime').select('*,anime_genres(genres(id,name,slug)),anime_studios(studios(id,name,slug)),anime_titles(kind,title)').eq('slug',slug).single();
  if(error||!anime)return null;
  const [{data:episodes},{data:relations}]=await Promise.all([
    db.from('episodes').select('*').eq('anime_id',anime.id).order('episode_number',{ascending:true}),
    db.from('related_anime').select('relation_type,related:related_anime_id(id,slug,title,poster_url,type,status,year,rating)').eq('anime_id',anime.id).limit(12),
  ]);
  return {anime,episodes:episodes??[],related:relations??[]};
}

export async function getWatchData(episodeId:string){
  const db=await createSupabaseServerClient();
  const {data:episode,error}=await db.from('episodes').select('*,anime:anime_id(*)').eq('id',episodeId).single();
  if(error||!episode)return null;
  const [{data:sources},{data:siblings},{data:userResult}]=await Promise.all([
    db.from('video_sources').select('*').eq('episode_id',episodeId).eq('is_active',true).order('created_at',{ascending:true}),
    db.from('episodes').select('id,episode_number,title').eq('anime_id',episode.anime_id).order('episode_number',{ascending:true}),
    db.auth.getUser(),
  ]);
  const user=userResult?.user??null;
  let progress:any=null;
  if(user){
    const {data}=await db.from('playback_progress').select('*').eq('user_id',user.id).eq('episode_id',episodeId).maybeSingle();
    progress=data;
  }
  return {episode,sources:sources??[],siblings:siblings??[],progress,userId:user?.id??null};
}
