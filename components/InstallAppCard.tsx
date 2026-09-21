'use client';

import { useEffect, useState } from 'react';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export function InstallAppCard() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'other'>('other');

  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    const ua = navigator.userAgent;
    setPlatform(/iPhone|iPad|iPod/i.test(ua) ? 'ios' : /Android/i.test(ua) ? 'android' : 'other');
    setInstalled(Boolean(nav.standalone) || window.matchMedia('(display-mode: standalone)').matches);

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === 'accepted') setInstalled(true);
    setPromptEvent(null);
  }

  return <section className="accountCard installCard" aria-labelledby="install-animori-title">
    <div className="installCardHead">
      <div>
        <span className="eyebrow">MOBILE APP</span>
        <h2 id="install-animori-title">Install Animori on your phone</h2>
      </div>
      {installed && <span className="installStatus">Installed</span>}
    </div>
    <p>Install Animori to your Home Screen for faster access and a cleaner app-like experience.</p>

    {!installed && promptEvent && <button className="primaryBtn installNow" type="button" onClick={() => void install()}>
      Install Animori
    </button>}

    {!installed && <div className="installInstructions">
      {platform === 'ios' ? <>
        <strong>iPhone / iPad</strong>
        <ol>
          <li>Open Animori in <b>Safari</b>.</li>
          <li>Tap the <b>Share</b> button.</li>
          <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
          <li>Tap <b>Add</b>.</li>
        </ol>
      </> : platform === 'android' ? <>
        <strong>Android</strong>
        <ol>
          <li>Open Animori in <b>Chrome</b>.</li>
          <li>Tap the <b>⋮</b> menu.</li>
          <li>Choose <b>Install app</b> or <b>Add to Home screen</b>.</li>
          <li>Confirm the installation.</li>
        </ol>
      </> : <>
        <strong>Install from your mobile browser</strong>
        <ol>
          <li>Open the browser menu.</li>
          <li>Choose <b>Install app</b> or <b>Add to Home Screen</b>.</li>
          <li>Confirm to add Animori.</li>
        </ol>
      </>}
    </div>}
  </section>;
}
