'use client';
import { useEffect,useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Search } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
export function SearchBox({initial=''}:{initial?:string}){const [q,setQ]=useState(initial),[rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(false);useEffect(()=>{const timer=setTimeout(async()=>{if(q.trim().length<2){setRows([]);return}setLoading(true);const {data}=await createSupabaseBrowserClient().rpc('search_anime',{p_query:q.trim(),p_limit:24});setRows(data??[]);setLoading(false)},180);return()=>clearTimeout(timer)},[q]);return <div><label className="bigSearch"><Search size={21}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search English, Japanese, or alternate titles…" autoFocus/><span>{loading?'SEARCHING…':'INSTANT'}</span></label><div className="searchResults">{rows.map(row=><Link href={`/anime/${row.slug}`} key={row.id}>{row.poster_url?<Image src={row.poster_url} alt="" width={58} height={78}/>:<span/>}<div><strong>{row.title}</strong><span>{[row.title_japanese,row.type,row.year].filter(Boolean).join(' · ')}</span></div><em>{row.latest_episode?`EP ${row.latest_episode}`:''}</em></Link>)}</div></div>}
