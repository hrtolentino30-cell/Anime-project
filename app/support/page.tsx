import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Support Animori',
  description: 'Ways to support Animori and help keep the experience reliable.',
};

export default function SupportPage() {
  return <div className="pageWidth standalone narrow">
    <div className="pageIntro">
      <span className="eyebrow">SUPPORT ANIMORI</span>
      <h1>Help Animori keep getting better.</h1>
      <p>Sharing Animori, following the page, and reporting broken playback all help us keep the catalog useful and the experience reliable.</p>
    </div>

    <section className="accountCard supportCard">
      <h2>Support the project</h2>
      <p>If you want to help Animori directly, reach out and we’ll point you to the currently available support options.</p>
      <div className="rowActions">
        <a className="primaryBtn" href="mailto:hello@animori.bond?subject=Support%20Animori">Support Animori</a>
        <a className="ghostBtn" href="https://www.facebook.com/animori.tv" target="_blank" rel="noreferrer">Follow on Facebook</a>
      </div>
    </section>

    <section className="section supportWays">
      <div className="sectionHead"><h2>Other ways to help</h2></div>
      <div className="supportWayGrid">
        <article><strong>Share Animori</strong><p>Send <b>animori.bond</b> to friends who watch anime.</p></article>
        <article><strong>Report playback issues</strong><p>Use the player’s Report option when an episode or server has a problem.</p></article>
        <article><strong>Keep your account active</strong><p>Using My List and Continue Watching helps us improve the viewing experience.</p></article>
      </div>
      <div className="rowActions"><Link className="ghostBtn" href="/">Back to Animori</Link></div>
    </section>
  </div>;
}
