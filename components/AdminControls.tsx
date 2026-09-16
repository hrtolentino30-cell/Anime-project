'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { SUPABASE_URL } from '@/lib/supabase/config';

async function callAdmin(body: Record<string, unknown>) {
  const db = createSupabaseBrowserClient();
  const { data: { session } } = await db.auth.getSession();
  if (!session?.access_token) throw new Error('Your session expired. Please sign in again.');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-sync`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await res.json().catch(() => ({ error: 'Invalid response from admin sync.' }));
  if (!res.ok) throw new Error(payload?.error ?? `Admin action failed (${res.status}).`);
  return payload;
}

export function AdminControls() {
  const [url, setUrl] = useState('');
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setOut('');
    try {
      const payload = await callAdmin({ action, ...extra });
      setOut(JSON.stringify(payload, null, 2));
      if (action !== 'inspect') setTimeout(() => location.reload(), 600);
    } catch (error) {
      setOut(JSON.stringify({ error: error instanceof Error ? error.message : 'Admin action failed.' }, null, 2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="adminControls">
      <div className="rowActions">
        <button className="primaryBtn" disabled={busy} onClick={() => act('scan')}>Trigger source scan</button>
        <button className="ghostBtn" disabled={busy} onClick={() => act('bootstrap')}>Initial catalog import</button>
      </div>
      <div className="adminUrl">
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder="Authorized source anime or episode URL" />
        <button className="ghostBtn" disabled={busy || !url} onClick={() => act('sync_url', { url })}>Queue URL</button>
        <button className="ghostBtn" disabled={busy || !url} onClick={() => act('inspect', { url })}>Inspect parser</button>
      </div>
      {out && <pre className="adminOutput">{out}</pre>}
    </div>
  );
}

export function RetryButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function retry() {
    setBusy(true);
    setError('');
    try {
      await callAdmin({ action: 'retry', id });
      location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed.');
      setBusy(false);
    }
  }

  return <span>{error && <small>{error}</small>}<button className="tinyBtn" disabled={busy} onClick={retry}>{busy ? '…' : 'Retry'}</button></span>;
}

export function DisableSourceButton({ id, disabled }: { id: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function disable() {
    setBusy(true);
    setError('');
    try {
      await callAdmin({ action: 'disable_source', id });
      location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disable failed.');
      setBusy(false);
    }
  }

  return <span>{error && <small>{error}</small>}<button className="tinyBtn" disabled={busy || disabled} onClick={disable}>{disabled ? 'Disabled' : busy ? '…' : 'Disable'}</button></span>;
}
