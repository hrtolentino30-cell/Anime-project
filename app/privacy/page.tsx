import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Animori collects, uses, stores, and deletes personal information.',
};

export default function PrivacyPage() {
  return <div className="pageWidth standalone narrow">
    <div className="pageIntro">
      <span className="eyebrow">LEGAL</span>
      <h1>Privacy Policy</h1>
      <p>Effective October 2, 2026. This policy explains how Animori handles information when you use the site and related services.</p>
    </div>
    <article className="legalArticle">
      <section><h2>1. Information we collect</h2><p>When you create an account, we may process your email address, authentication information, display name, and account identifiers. When you use Animori, we may store watch progress, viewing history, favorites or saved titles, playback reports, and similar preferences associated with your account.</p><p>For basic analytics and reliability, we may record a session identifier, page path, referring host, device category, playback events, timestamps, and technical logs. Hosting and security providers may also process network information such as IP address and browser details as part of delivering and protecting the service.</p></section>
      <section><h2>2. How we use information</h2><p>We use this information to provide account features, remember watch progress and preferences, operate search and playback, diagnose failures, prevent abuse, understand aggregate usage, maintain security, and improve Animori.</p></section>
      <section><h2>3. Service providers and third parties</h2><p>Animori uses service providers including Supabase for authentication and application data, Vercel for web application hosting, and Cloudflare for web analytics and network services. These providers process information only as needed to provide their services to Animori and under their own applicable terms and privacy practices.</p><p>Some playback or linked content may be supplied by third-party sources. Loading third-party media can cause those providers to receive ordinary connection information such as your IP address, browser information, and request details.</p></section>
      <section><h2>4. Meta and Facebook</h2><p>Animori uses Meta APIs to administer Animori-owned Facebook Page content. This integration is not used to collect Facebook profile information from ordinary visitors to the Animori website. If a Meta integration later collects information associated with you, deletion requests may be submitted using our <Link href="/data-deletion">data deletion instructions</Link>.</p></section>
      <section><h2>5. Cookies and local storage</h2><p>Animori may use browser storage, session storage, and cookies that are necessary for authentication, preferences, session continuity, playback progress, and analytics. You can clear browser storage through your browser settings, although doing so may sign you out or reset local preferences.</p></section>
      <section><h2>6. Retention</h2><p>Account-linked information is generally retained while your account is active or while reasonably necessary to provide the service, meet security needs, resolve disputes, or comply with applicable obligations. Aggregated or de-identified analytics may be retained when they no longer identify an individual user.</p></section>
      <section><h2>7. Your choices</h2><p>You may update certain profile information from your account page. You may also request deletion of your account and associated personal information by following our <Link href="/data-deletion">data deletion instructions</Link>.</p></section>
      <section><h2>8. Security</h2><p>We use reasonable technical and organizational safeguards designed to protect information. No internet service can guarantee absolute security, so we cannot promise that unauthorized access will never occur.</p></section>
      <section><h2>9. Children</h2><p>Animori is not intended to knowingly collect personal information from children in violation of applicable law. If you believe a child has provided personal information that should be removed, contact us.</p></section>
      <section><h2>10. Changes to this policy</h2><p>We may update this policy as Animori changes. The effective date above will be updated when material revisions are made.</p></section>
      <section><h2>11. Contact</h2><p>Questions or privacy requests can be sent to <a href="mailto:hello@animori.bond">hello@animori.bond</a>.</p></section>
    </article>
  </div>;
}
