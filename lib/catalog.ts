import { createSupabaseServerClient } from './supabase/server';

export async function getAnimeBySlug(slug:string) {
  const db=await createSupabaseServerClient();
  const {data,error}=await db.from('anime').select('*, anime_genres(genres(id,name,slug)), anime_studios(studios(id,name,slug)), anime_titles(kind,title)').eq('slug',slug).single();
  if(error) return null; return data;
}
export async function getEpisodes(animeId:string) {
  const db=await createSupabaseServerClient();
  const {data}=await db.from('episodes').select('*').eq('anime_id',animeId).order('episode_number',{ascending:false}); return data ?? [];
}
export async function getEpisode(id:string) {
  const db=await createSupabaseServerClient();
  const {data}=await db.from('episodes').select('*, anime(*), video_sources(*)').eq('id',id).single(); return data;
}
