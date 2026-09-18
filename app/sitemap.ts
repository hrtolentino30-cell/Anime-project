import type { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY,SUPABASE_URL } from '@/lib/supabase/config';
export const revalidate=3600;
export default async function sitemap():Promise<MetadataRoute.Sitemap>{const base='https://animori.vercel.app',db=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}}),{data}=await db.from('anime').select('slug,updated_at').order('updated_at',{ascending:false}).limit(50000);const fixed=['','/browse','/schedule','/az'].map((path,i)=>({url:base+path,lastModified:new Date(),changeFrequency:(i===0?'daily':'weekly') as 'daily'|'weekly',priority:i===0?1:.7}));return[...fixed,...(data??[]).map((a:any)=>({url:`${base}/anime/${a.slug}`,lastModified:a.updated_at?new Date(a.updated_at):new Date(),changeFrequency:'weekly' as const,priority:.8}))]}
