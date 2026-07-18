'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { api } from '../../lib/api';
import { saveAuth } from '../../lib/auth';

export default function Register() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const res = await api.register(email, password, displayName);
      saveAuth(res);
      router.push('/dashboard');
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container">
      <div className="card" style={{ maxWidth: 420, margin: '40px auto' }}>
        <h2>Create account</h2>
        <form onSubmit={submit}>
          <label>Display name</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label>Password (min 6)</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {err && <div className="error">{err}</div>}
          <div className="row" style={{ marginTop: 16 }}>
            <button disabled={busy}>{busy ? '…' : 'Create & play'}</button>
            <Link href="/login">Log in instead</Link>
          </div>
        </form>
      </div>
    </main>
  );
}
