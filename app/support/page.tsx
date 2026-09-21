import type { Metadata } from 'next';
import Link from 'next/link';
import { Heart, Mail, PlayCircle, Share2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Support Animori',
  description: 'Ways to support Animori and get help.',
};

export default function SupportPage() {
  return <div className="pageWidth standalone narrow supportPage">
    <div className="pageIntro">
      <span className="eyebrow">SUPPORT ANIMORI</span>
      <h1>Help Animori get better.</h1>
      <p>Share the site, report playback problems when you find them, or send us feedback. These help keep Animori useful and reliable.</p>
    </div>
    <div className="supportGrid">
      <article><Share2 aria-hidden="true" /><h2>Share Animori</h2><p>Send <b>animori.bond</b> to another anime fan.</p><Link className="ghostBtn" href="/">Back to Animori</Link></article>
      <article><PlayCircle aria-hidden="true" /><h2>Report playback issues</h2><p>While watching, open the player menu and choose <b>Report issue</b>. That includes the episode and source automatically.</p><Link className="ghostBtn" href="/history">Continue watching</Link></article>
      <article><Mail aria-hidden="true" /><h2>Contact us</h2><p>For account questions, feedback, or anything the player report cannot cover.</p><a className="primaryBtn" href="mailto:hello@animori.bond">Email support</a></article>
    </div>
    <div className="supportNote"><Heart size={16} fill="currentColor" aria-hidden="true" /> Thanks for supporting Animori.</div>
  </div>;
}
