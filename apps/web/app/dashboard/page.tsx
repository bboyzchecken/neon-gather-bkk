'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { Item, User } from '@neon/shared-types';
import { api } from '../../lib/api';
import { clearAuth, loadAuth } from '../../lib/auth';

export default function Dashboard() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [inv, setInv] = useState<Item[]>([]);
  const [market, setMarket] = useState<Item[]>([]);
  const [err, setErr] = useState('');

  const refresh = useCallback(async (t: string) => {
    try {
      const [u, i, m] = await Promise.all([api.me(t), api.inventory(t), api.market(t)]);
      setMe(u);
      setInv(i);
      setMarket(m);
    } catch (ex) {
      setErr((ex as Error).message);
    }
  }, []);

  useEffect(() => {
    const a = loadAuth();
    if (!a) {
      router.push('/login');
      return;
    }
    setToken(a.access_token);
    void refresh(a.access_token);
  }, [router, refresh]);

  async function act(fn: () => Promise<unknown>) {
    if (!token) return;
    setErr('');
    try {
      await fn();
      await refresh(token);
    } catch (ex) {
      setErr((ex as Error).message);
    }
  }

  if (!me) {
    return (
      <main className="container">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  return (
    <main className="container">
      <div className="spread">
        <div className="brand">
          Neon <span>Gather</span> BKK
        </div>
        <div className="row">
          <span className="coins">💰 {me.coins}</span>
          <Link href="/play">
            <button>Enter the Avenue</button>
          </Link>
          <button
            className="secondary"
            onClick={() => {
              clearAuth();
              router.push('/');
            }}
          >
            Log out
          </button>
        </div>
      </div>
      <p className="muted">
        Signed in as <b>{me.display_name}</b>
        {me.is_guest ? ' (guest)' : ''}
      </p>
      {err && <div className="error">{err}</div>}

      <div className="card">
        <h3>Your inventory ({inv.length})</h3>
        {inv.length === 0 && <p className="muted">Empty — buy something from the marketplace below!</p>}
        <div className="grid">
          {inv.map((it) => (
            <div className="item" key={it.id}>
              {it.thumbnail_url && (
                <img
                  src={it.thumbnail_url}
                  alt={it.name}
                  style={{ width: '100%', height: 96, objectFit: 'contain', marginBottom: 8 }}
                />
              )}
              <div className="spread">
                <b>{it.name}</b>
                {it.rarity && <span className={`pill ${it.rarity}`}>{it.rarity}</span>}
              </div>
              <div className="muted" style={{ fontSize: 13, margin: '6px 0' }}>
                {it.category} · {it.price} coins {it.listed_for_sale ? '· listed' : ''}
              </div>
              <div className="row">
                {it.listed_for_sale ? (
                  <button className="secondary" onClick={() => act(() => api.unlist(token!, it.id))}>
                    Unlist
                  </button>
                ) : (
                  <>
                    <button
                      className="gold"
                      onClick={() => {
                        const p = prompt('List price (coins)?', String(Math.max(1, it.price)));
                        if (p) void act(() => api.list(token!, it.id, Number(p)));
                      }}
                    >
                      List
                    </button>
                    <button
                      className="secondary"
                      onClick={() => act(() => api.vendorSell(token!, it.id))}
                    >
                      Sell {it.price}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Marketplace ({market.length})</h3>
        {market.length === 0 && <p className="muted">Nothing listed right now.</p>}
        <div className="grid">
          {market.map((it) => (
            <div className="item" key={it.id}>
              {it.thumbnail_url && (
                <img
                  src={it.thumbnail_url}
                  alt={it.name}
                  style={{ width: '100%', height: 96, objectFit: 'contain', marginBottom: 8 }}
                />
              )}
              <div className="spread">
                <b>{it.name}</b>
                {it.rarity && <span className={`pill ${it.rarity}`}>{it.rarity}</span>}
              </div>
              <div className="muted" style={{ fontSize: 13, margin: '6px 0' }}>
                {it.category} · <span className="coins">{it.price}</span> · {it.owner_name ?? '—'}
              </div>
              <button
                disabled={it.owner_id === me.id}
                onClick={() => act(() => api.buy(token!, it.id))}
              >
                {it.owner_id === me.id ? 'Yours' : 'Buy'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
