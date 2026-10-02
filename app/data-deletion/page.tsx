import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Data Deletion',
  description: 'How to request deletion of your Animori account and personal data.',
};

export default function DataDeletionPage() {
  return <div className="pageWidth standalone narrow">
    <div className="pageIntro">
      <span className="eyebrow">PRIVACY</span>
      <h1>Data deletion</h1>
      <p>You can request deletion of your Animori account and personal information using the steps below.</p>
    </div>
    <article className="legalArticle">
      <section><h2>How to request deletion</h2><ol><li>Email <a href="mailto:hello@animori.bond?subject=Animori%20data%20deletion%20request">hello@animori.bond</a> from the email address associated with your Animori account.</li><li>Use the subject <strong>Animori data deletion request</strong>.</li><li>Include the email address or account identifier you want deleted. Do not send your password.</li><li>We may ask you to verify control of the account before deletion is completed.</li></ol></section>
      <section><h2>What we delete</h2><p>After a verified request, we will delete or anonymize personal information associated with the account where reasonably possible, including profile information, saved preferences, watch progress, viewing history, and other account-linked application records. We will also delete the authentication account where applicable.</p></section>
      <section><h2>What may remain</h2><p>We may retain information when required for security, fraud prevention, legal compliance, dispute resolution, or other legitimate obligations. Aggregated or de-identified analytics that can no longer reasonably be linked to you may also remain.</p></section>
      <section><h2>Meta and Facebook data</h2><p>If you interacted with an Animori Meta or Facebook integration and want information associated with that interaction deleted, use the same email process above and mention <strong>Meta/Facebook data deletion</strong> in your message. Animori's current Page-management integration is used to administer Animori-owned Page content rather than to provide Facebook Login to ordinary Animori visitors.</p></section>
      <section><h2>Timing</h2><p>We aim to complete verified deletion requests within 30 days, unless a longer period is reasonably necessary or required by applicable law.</p></section>
      <section><h2>Need help?</h2><p>For other privacy questions, see the <Link href="/privacy">Privacy Policy</Link> or contact <a href="mailto:hello@animori.bond">hello@animori.bond</a>.</p></section>
    </article>
  </div>;
}
