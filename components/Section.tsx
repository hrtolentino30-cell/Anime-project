import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { AnimeCard } from './AnimeCard';
export function Section({title,items,href='/browse'}:{title:string;items:any[];href?:string}){if(!items.length)return null;return <section className="section pageWidth"><div className="sectionHead"><h2>{title}</h2><Link href={href}>View all <ChevronRight size={16}/></Link></div><div className="cardGrid">{items.map(a=><AnimeCard key={a.id??a.slug} anime={a} badge={a.latest_episode?`EP ${a.latest_episode}`:undefined}/>)}</div></section>}
