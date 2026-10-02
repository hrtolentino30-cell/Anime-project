import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms that apply when you use Animori.',
};

export default function TermsPage() {
  return <div className="pageWidth standalone narrow">
    <div className="pageIntro">
      <span className="eyebrow">LEGAL</span>
      <h1>Terms of Service</h1>
      <p>Effective October 2, 2026. By using Animori, you agree to these terms.</p>
    </div>
    <article className="legalArticle">
      <section><h2>1. The service</h2><p>Animori helps users discover anime, browse title and episode information, save preferences, track watch progress, and access available playback sources. Features may change, be interrupted, or be removed as the service evolves.</p></section>
      <section><h2>2. Accounts</h2><p>You are responsible for maintaining the confidentiality of your account credentials and for activity performed through your account. Information you provide must be accurate enough for us to operate and secure the account.</p></section>
      <section><h2>3. Third-party content and services</h2><p>Animori may display, link to, or embed information and media supplied by third parties. Third-party content remains subject to the rights, rules, availability, and policies of its respective providers and rights holders. Animori does not grant you ownership of, or redistribution rights to, third-party media.</p><p>We do not guarantee that any specific title, episode, link, stream, or third-party service will remain available, accurate, uninterrupted, or error-free.</p></section>
      <section><h2>4. Acceptable use</h2><p>You may not misuse Animori, attempt to bypass security controls, interfere with the service, abuse accounts or automated interfaces, introduce malicious code, scrape protected areas without authorization, or use Animori in a way that violates applicable law or the rights of others.</p></section>
      <section><h2>5. Animori materials</h2><p>The Animori name, interface, original graphics, software, and other original service materials are protected by applicable intellectual-property laws. These terms do not transfer ownership of Animori's original materials to you.</p></section>
      <section><h2>6. Suspension and termination</h2><p>We may restrict or terminate access when reasonably necessary to protect the service, other users, third parties, or our legal obligations, including in response to abuse, security incidents, or repeated violations of these terms.</p></section>
      <section><h2>7. Disclaimer</h2><p>Animori is provided on an “as is” and “as available” basis to the extent permitted by law. We make no guarantee that the service will always be available, complete, secure, or suitable for every purpose.</p></section>
      <section><h2>8. Limitation of liability</h2><p>To the maximum extent permitted by applicable law, Animori and its operators will not be liable for indirect, incidental, special, consequential, or punitive damages arising from use of, or inability to use, the service or third-party content.</p></section>
      <section><h2>9. Changes</h2><p>We may update these terms as the service changes. Continued use after an updated version becomes effective means you accept the revised terms.</p></section>
      <section><h2>10. Contact</h2><p>Questions about these terms can be sent to <a href="mailto:hello@animori.bond">hello@animori.bond</a>.</p></section>
    </article>
  </div>;
}
