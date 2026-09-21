import { createClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/lib/supabase/config';

const HOME_ANIME_FIELDS='id,slug,title,description,poster_url,banner_url,type,status,season,year,rating,latest_episode,updated_at';

function createPublicCatalogClient(){
  return createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}

const getCachedHomeCatalog=unstable_cache(async()=>{
  const db=createPublicCatalogClient();
  const [updated,latest,seasonal,movies,completed,highlyRated]=await Promise.all([
    db.from('anime').select(HOME_ANIME_FIELDS).order('updated_at',{ascending:false}).limit(24),
    db.from('episodes').select('id,episode_number,title,air_date,anime:anime_id(id,slug,title,poster_url,type)').order('created_at',{ascending:false}).limit(16),
    db.from('anime').select(HOME_ANIME_FIELDS).ilike('status','%ongoing%').order('updated_at',{ascending:false}).limit(12),
    db.from('anime').select(HOME_ANIME_FIELDS).ilike('type','%movie%').order('updated_at',{ascending:false}).limit(12),
    db.from('anime').select(HOME_ANIME_FIELDS).ilike('status','%complete%').order('updated_at',{ascending:false}).limit(12),
    db.from('anime').select(HOME_ANIME_FIELDS).gt('rating',0).order('rating',{ascending:false}).order('year',{ascending:false}).limit(12),
  ]);
  return {updatedAnime:updated.data??[],latestEpisodes:latest.data??[],seasonal:seasonal.data??[],movies:movies.data??[],completed:completed.data??[],highlyRated:highlyRated.data??[]};
},['animori-public-home-v3'],{revalidate:120});

async function getContinueWatching(){
  const db=await createSupabaseServerClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)return [];
  const {data}=await db.from('continue_watching').select('*').eq('user_id',user.id).order('updated_at',{ascending:false}).limit(12);
  return data??[];
}

export async function getHomeData(){
  const [catalog,continuing]=await Promise.all([getCachedHomeCatalog(),getContinueWatching()]);
  return {...catalog,continuing};
}

const getCachedAnimeBySlug=unstable_cache(async(slug:string)=>{
  const db=createPublicCatalogClient();
  const {data:anime,error}=await (db.from('anime') as any).select('id,slug,title,title_english,title_japanese,description,poster_url,banner_url,type,status,season,year,rating,duration,latest_episode,total_episodes,source_updated_at,created_at,updated_at,anime_genres(genres(id,name,slug)),anime_studios(studios(id,name,slug)),anime_titles(kind,title),anime_characters(role,characters(id,name,image_url,character_voice_actors(language,voice_actors(id,name,language,image_url))))').eq('slug',slug).single();
  if(error||!anime)return null;
  const [{data:episodes},{data:relations}]=await Promise.all([
    (db.from('episodes') as any).select('id,anime_id,episode_number,title,thumbnail_url,air_date,created_at,updated_at').eq('anime_id',anime.id).order('episode_number',{ascending:true}),
    (db.from('related_anime') as any).select('relation_type,related:related_anime_id(id,slug,title,poster_url,type,status,year,rating)').eq('anime_id',anime.id).limit(12),
  ]);
  return {anime,episodes:episodes??[],related:relations??[]};
},['animori-anime-detail-v5'],{revalidate:300});

export async function getAnimeBySlug(slug:string){return getCachedAnimeBySlug(slug)}

function orderVideoSources<T extends {source_type?:string|null;server_name?:string|null;language?:string|null;embed_url?:string|null;stream_url?:string|null;verification_failures?:number|null;last_verified_at?:string|null;created_at?:string|null}>(sources:T[]){
  const typeRank=(source:T)=>source.source_type==='hls'?0:source.source_type==='mp4'?10:20;
  const hostRank=(source:T)=>{
    const raw=source.stream_url??source.embed_url??'';
    try{
      const host=new URL(raw).hostname.toLowerCase();
      if(host==='tryembed.us.cc'||host.endsWith('.tryembed.us.cc'))return 0;
      if(host.includes('animotvslash'))return 20;
      if(host.includes('vidnest'))return 40;
      if(host.includes('megaplay'))return 50;
      return 10;
    }catch{return 30}
  };
  const healthRank=(source:T)=>{
    const failures=Number(source.verification_failures??0);
    if(failures>=2)return 80;
    if(failures===1)return 30;
    const verified=source.last_verified_at?Date.parse(source.last_verified_at):NaN;
    return Number.isFinite(verified)&&Date.now()-verified<=12*60*60*1000?0:10;
  };
  const languageRank=(source:T)=>{
    const language=(source.language??source.server_name??'').toLowerCase();
    if(/soft\s*sub/.test(language))return 1;
    if(/\bsub\b/.test(language))return 0;
    if(/dub/.test(language))return 4;
    return 2;
  };
  return [...sources].sort((a,b)=>{
    const scoreA=typeRank(a)+hostRank(a)+healthRank(a)+languageRank(a);
    const scoreB=typeRank(b)+hostRank(b)+healthRank(b)+languageRank(b);
    if(scoreA!==scoreB)return scoreA-scoreB;
    return String(b.last_verified_at??b.created_at??'').localeCompare(String(a.last_verified_at??a.created_at??''));
  });
}

const getCachedWatchCore=unstable_cache(async(episodeId:string)=>{
  const db=createPublicCatalogClient();
  const {data:episode,error}=await (db.from('episodes') as any).select('id,anime_id,episode_number,title,thumbnail_url,air_date,created_at,updated_at,anime:anime_id(id,slug,title,title_english,title_japanese,description,poster_url,banner_url,type,status,season,year,rating,duration,latest_episode,total_episodes,source_updated_at,created_at,updated_at)').eq('id',episodeId).single();
  if(error||!episode)return null;
  const [{data:sources},{data:siblings}]=await Promise.all([
    db.from('video_sources').select('id,episode_id,server_name,source_type,embed_url,stream_url,quality,language,is_active,verification_failures,last_verified_at,created_at,updated_at').eq('episode_id',episodeId).eq('is_active',true).order('created_at',{ascending:true}),
    db.from('episodes').select('id,episode_number,title').eq('anime_id',episode.anime_id).order('episode_number',{ascending:true}),
  ]);
  const ordered=orderVideoSources(sources??[]);
  const direct=ordered.filter((source:any)=>source.source_type==='hls'||source.source_type==='mp4');
  const fallback=ordered.filter((source:any)=>source.source_type!=='hls'&&source.source_type!=='mp4');
  const usable=direct.length?[...direct,...fallback.slice(0,3)]:ordered.slice(0,6);
  return {episode,sources:usable,siblings:siblings??[]};
},['animori-watch-core-v7'],{revalidate:60});

export async function getWatchData(episodeId:string){
  const [core,db]=await Promise.all([getCachedWatchCore(episodeId),createSupabaseServerClient()]);
  if(!core)return null;
  const {data:{user}}=await db.auth.getUser();
  let progress:any=null;
  if(user){
    const {data}=await db.from('playback_progress').select('position_seconds,duration_seconds,completed,updated_at').eq('user_id',user.id).eq('episode_id',episodeId).maybeSingle();
    progress=data;
  }
  return {...core,progress,userId:user?.id??null};
}
