'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type {
  CheersPartnerView,
  Item,
  ListedCoasterView,
  PlayerJob,
  QuestView,
  RegularStatusView,
  User,
} from '@neon/shared-types';
import { api } from '../../lib/api';
import { clearAuth, loadAuth } from '../../lib/auth';

export default function Dashboard() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [inv, setInv] = useState<Item[]>([]);
  const [market, setMarket] = useState<Item[]>([]);
  const [jobs, setJobs] = useState<PlayerJob[]>([]);
  const [quests, setQuests] = useState<QuestView[]>([]);
  const [coasterMarket, setCoasterMarket] = useState<ListedCoasterView[]>([]);
  const [regulars, setRegulars] = useState<RegularStatusView[]>([]);
  const [cheers, setCheers] = useState<CheersPartnerView[]>([]);
  const [err, setErr] = useState('');

  const refresh = useCallback(async (t: string) => {
    try {
      const [u, i, m, j, q, cm, rg, ch] = await Promise.all([
        api.me(t),
        api.inventory(t),
        api.market(t),
        api.jobs(t).catch(() => [] as PlayerJob[]),
        api.quests(t).catch(() => [] as QuestView[]),
        api.coasterMarket(t).catch(() => [] as ListedCoasterView[]),
        api.myRegulars(t).catch(() => [] as RegularStatusView[]),
        api.myCheers(t).catch(() => [] as CheersPartnerView[]),
      ]);
      setMe(u);
      setInv(i);
      setMarket(m);
      setJobs(j);
      setQuests(q);
      setCoasterMarket(cm);
      setRegulars(rg);
      setCheers(ch);
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
          <Link href="/jobs">
            <button className="secondary">💼 Jobs</button>
          </Link>
          <Link href="/album">
            <button className="secondary">📸 Album</button>
          </Link>
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

      {jobs.length > 0 && (
        <div className="card">
          <h3>Jobs & levels</h3>
          <div className="grid">
            {jobs.map((j) => {
              const base = j.level > 1 ? 50 * j.level * (j.level - 1) : 0;
              const span = j.xp_for_next > base ? j.xp_for_next - base : 1;
              const pct =
                j.xp_for_next === 0 ? 100 : Math.min(100, Math.round(((j.xp - base) / span) * 100));
              return (
                <div className="item" key={j.job_type}>
                  <div className="spread">
                    <b>{j.job_type}</b>
                    <span className="pill">Lv.{j.level}</span>
                  </div>
                  <div
                    style={{
                      background: '#22343f',
                      borderRadius: 6,
                      height: 8,
                      margin: '8px 0',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: '#c97f56',
                        borderRadius: 6,
                      }}
                    />
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {j.xp} XP{j.xp_for_next > 0 ? ` · next at ${j.xp_for_next}` : ' · MAX'}
                    {j.unlocked_perks.length > 0 &&
                      ` · perks: ${j.unlocked_perks.map((p) => p.name).join(', ')}`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {quests.length > 0 && (
        <div className="card">
          <h3>Quests</h3>
          {quests.map((q) => {
            const progress = q.type === 'COMMUNITY' ? (q.community_progress ?? 0) : q.progress;
            const communityDone = q.type === 'COMMUNITY' && progress >= q.target && q.progress > 0;
            const claimable =
              q.status === 'COMPLETED' || (communityDone && q.status !== 'CLAIMED');
            return (
              <div
                className="spread"
                key={`${q.id}-${q.period_key}`}
                style={{ borderTop: '1px solid #2a3f4d', padding: '8px 0' }}
              >
                <span>
                  <span className="pill">{q.type}</span> <b>{q.title}</b>{' '}
                  <span className="muted">
                    · {Math.min(progress, q.target)}/{q.target}
                    {q.reward_coins > 0 ? ` · reward ${q.reward_coins}c` : ''}
                  </span>
                </span>
                {q.status === 'CLAIMED' ? (
                  <span className="muted">claimed ✔</span>
                ) : claimable ? (
                  <button className="gold" onClick={() => act(() => api.claimQuest(token!, q.id))}>
                    Claim
                  </button>
                ) : (
                  <span className="muted">{q.type === 'COMMUNITY' ? 'community goal' : 'in progress'}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

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

      {(regulars.length > 0 || cheers.length > 0) && (
        <div className="card">
          <h3>🍻 Bar social</h3>
          {regulars.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {regulars.map((r) => (
                <div className="spread" key={`${r.shop_id}-${r.menu_name}`} style={{ padding: '4px 0' }}>
                  <span>
                    {r.achieved_at ? '⭐ ' : ''}
                    <b>{r.menu_name}</b>{' '}
                    <span className="muted">at {r.shop_code ?? r.shop_id.slice(0, 8)}</span>
                  </span>
                  <span className="muted">
                    {r.achieved_at
                      ? `Regular since ${new Date(r.achieved_at).toLocaleDateString()}`
                      : `${Math.min(r.order_count, r.threshold)}/${r.threshold}`}
                  </span>
                </div>
              ))}
            </div>
          )}
          {cheers.length > 0 && (
            <p className="muted" style={{ fontSize: 13 }}>
              Cheers partners:{' '}
              {cheers.map((c) => `${c.partner_name || 'player'} (${c.total_count}×)`).join(' · ')}
            </p>
          )}
        </div>
      )}

      {coasterMarket.length > 0 && (
        <div className="card">
          <h3>🪙 Coaster market ({coasterMarket.length})</h3>
          <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
            {coasterMarket.map((l) => (
              <div key={l.listing_id} style={{ textAlign: 'center', width: 110 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    l.image_url && l.moderation !== 'REJECTED'
                      ? l.image_url
                      : l.tier === 'OPENING_NIGHT'
                        ? '/assets/coasters/coaster_opening_01.png'
                        : '/assets/coasters/coaster_blank_01.png'
                  }
                  alt={`${l.tier} coaster`}
                  style={{ width: 72, height: 72 }}
                />
                <div className="muted" style={{ fontSize: 11 }}>
                  {l.shop_code ?? '—'}
                  {l.tier === 'OPENING_NIGHT' ? ' 🥇' : ''} · <span className="coins">{l.price}</span>
                  <br />
                  by {l.seller_name ?? '—'}
                </div>
                <button
                  disabled={l.seller_id === me.id}
                  style={{ fontSize: 11, padding: '2px 10px' }}
                  onClick={() => act(() => api.buyCoaster(token!, l.listing_id))}
                >
                  {l.seller_id === me.id ? 'Yours' : 'Buy'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
