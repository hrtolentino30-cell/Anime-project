'use client';

import { useEffect, useState } from 'react';
import { Download, Share2, Smartphone } from 'lucide-react';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export function InstallAppCard() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'other'>('other');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    const standalone = window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
    setInstalled(standalone);

    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(ua);
    setPlatform(isIOS ? 'ios' : isAndroid ? 'android' : 'other');

    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const appInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
      setMessage('Animori is installed on this device.');
    };

    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', appInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', appInstalled);
    };
  }, []);

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice.catch(() => null);
    if (choice?.outcome === 'accepted') setMessage('Animori is being added to your home screen.');
    setPromptEvent(null);
  }

  return <section className="installAppCard" aria-labelledby="install-animori-title">
    <div className="installAppIcon"><Smartphone aria-hidden="true" /></div>
    <div className="installAppBody">
      <span className="eyebrow">MOBILE APP</span>
      <h2 id="install-animori-title">Install Animori</h2>
      <p>Keep Animori on your home screen for a faster, app-like viewing experience.</p>

      {installed ? <div className="installState">✓ Animori is installed on this device.</div> : <>
        {promptEvent && <button className="primaryBtn installAction" type="button" onClick={() => void install()}>
          <Download size={17} aria-hidden="true" /> Install Animori
        </button>}

        <div className="installSteps">
          {platform === 'ios' ? <>
            <strong>iPhone / iPad</strong>
            <ol>
              <li>Open Animori in Safari.</li>
              <li>Tap the <Share2 size={15} aria-hidden="true" /> Share button.</li>
              <li>Choose <b>Add to Home Screen</b>.</li>
              <li>Tap <b>Add</b>.</li>
            </ol>
          </> : platform === 'android' ? <>
            <strong>Android</strong>
            <ol>
              <li>Open Animori in Chrome.</li>
              <li>{promptEvent ? 'Tap Install Animori above.' : 'Open the Chrome menu (⋮).'}</li>
              <li>If needed, choose <b>Install app</b> or <b>Add to Home screen</b>.</li>
              <li>Confirm the installation.</li>
            </ol>
          </> : <>
            <strong>Install on your phone</strong>
            <p>On iPhone, use Safari → Share → Add to Home Screen. On Android, use Chrome → menu (⋮) → Install app or Add to Home screen.</p>
          </>}
        </div>
      </>}

      {message && <p className="formMessage" role="status">{message}</p>}
    </div>
  </section>;
}
