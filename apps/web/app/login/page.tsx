'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { api } from '../../lib/api';
import { saveAuth } from '../../lib/auth';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('demo@neon.gg');
  const [password, setPassword] = useState('demo1234');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const res = await api.login(email, password);
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
        <h2>Log in</h2>
        <p className="muted" style={{ fontSize: 13 }}>
          Seeded demo account is pre-filled.
        </p>
        <form onSubmit={submit}>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {err && <div className="error">{err}</div>}
          <div className="row" style={{ marginTop: 16 }}>
            <button disabled={busy}>{busy ? '…' : 'Log in'}</button>
            <Link href="/register">Create account</Link>
          </div>
        </form>
      </div>
    </main>
  );
}
