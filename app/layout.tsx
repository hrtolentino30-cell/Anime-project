import type { Metadata } from 'next';
import './globals.css';
import { Header } from '@/components/Header';
export const metadata:Metadata={title:{default:'AnimeSync',template:'%s · AnimeSync'},description:'An automatically synchronized anime streaming catalog.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><Header/><main>{children}</main><footer className="footer"><div className="brand"><span className="brandMark">A</span><span>ANIME<span>SYNC</span></span></div><p>Catalog updates are synchronized automatically from the authorized source pipeline.</p></footer></body></html>}
