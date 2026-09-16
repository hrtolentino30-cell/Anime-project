'use client';

import { FormEvent, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage('');

    const form = new FormData(e.currentTarget);
    const email = String(form.get('email') || '');
    const password = String(form.get('password') || '');
    const db = createSupabaseBrowserClient();

    if (mode === 'register') {
      const { data, error } = await db.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${location.origin}/auth/callback?next=/account`,
        },
      });
      setBusy(false);
      if (error) return setMessage(error.message);
      if (data.session) {
        location.href = '/account';
        return;
      }
      setMessage('Account created. Check your email to confirm your address, then you’ll return to Animori.');
      return;
    }

    const { error } = await db.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setMessage(error.message);
    location.href = '/';
  }

  async function magic(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    const email = String(new FormData(e.currentTarget).get('email') || '');
    const { error } = await createSupabaseBrowserClient().auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback?next=/account`,
      },
    });
    setBusy(false);
    setMessage(error?.message ?? 'Magic link sent. Check your email.');
  }

  return (
    <div>
      <form onSubmit={submit}>
        <label>
          Email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            minLength={8}
            required
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </label>
        <button className="primaryBtn" disabled={busy}>
          {busy ? 'Working…' : mode === 'login' ? 'Log in' : 'Create account'}
        </button>
      </form>
      {mode === 'login' && (
        <form onSubmit={magic}>
          <label>
            Email for magic link
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <button className="ghostBtn full" disabled={busy}>Send magic link</button>
        </form>
      )}
      {message && <p className="formMessage">{message}</p>}
    </div>
  );
}
