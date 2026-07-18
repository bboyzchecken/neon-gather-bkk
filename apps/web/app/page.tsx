'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { loadAuth } from '../lib/auth';

export default function Home() {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    setName(loadAuth()?.user.display_name ?? null);
  }, []);

  return (
    <main className="container">
      <div className="brand">
        Neon <span>Gather</span> BKK
      </div>
      <p className="muted">
        Cozy multiplayer community mall — rent a plot, run your shop, trade at the market, hang out.
      </p>
      <div className="card">
        {name ? (
          <>
            <p>
              Welcome back, <b>{name}</b>.
            </p>
            <div className="row">
              <Link href="/play">
                <button>Enter the Avenue</button>
              </Link>
              <Link href="/dashboard">
                <button className="secondary">Dashboard</button>
              </Link>
            </div>
          </>
        ) : (
          <div className="row">
            <Link href="/login">
              <button>Log in</button>
            </Link>
            <Link href="/register">
              <button className="secondary">Create account</button>
            </Link>
            <Link href="/play">
              <button className="gold">Play as guest</button>
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
