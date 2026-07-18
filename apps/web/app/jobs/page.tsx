'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { EmploymentView, JobPostingView, Plot, User } from '@neon/shared-types';
import { api } from '../../lib/api';
import { loadAuth } from '../../lib/auth';

export default function JobBoard() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [postings, setPostings] = useState<JobPostingView[]>([]);
  const [myPlots, setMyPlots] = useState<Plot[]>([]);
  const [gigs, setGigs] = useState<EmploymentView[]>([]);
  const [apps, setApps] = useState<Record<string, EmploymentView[]>>({});
  const [err, setErr] = useState('');

  const refresh = useCallback(async (t: string) => {
    try {
      const [u, ps, plots, es] = await Promise.all([
        api.me(t),
        api.postings(t),
        api.plots(t),
        api.myEmployments(t),
      ]);
      setMe(u);
      setPostings(ps);
      setMyPlots(plots.filter((p) => p.is_mine));
      setGigs(es);
      // applications for my own postings
      const mine = ps.filter((p) => p.owner_id === u.id);
      const entries = await Promise.all(
        mine.map(async (p) => [p.id, await api.applications(t, p.id)] as const),
      );
      setApps(Object.fromEntries(entries));
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

  const activeGig = (e: EmploymentView) => e.status === 'ACTIVE';

  return (
    <main className="container">
      <div className="spread">
        <div className="brand">
          💼 <span>Job Board</span>
        </div>
        <div className="row">
          <span className="coins">💰 {me.coins}</span>
          <Link href="/dashboard">
            <button className="secondary">Dashboard</button>
          </Link>
          <Link href="/play">
            <button>Enter the Avenue</button>
          </Link>
        </div>
      </div>
      <p className="muted">
        Work at another player&apos;s shop: collect tables on their plot to earn the posted wage.
        Tips and reviews only between players — hearts are for story NPCs, never real people.
      </p>
      {err && <div className="error">{err}</div>}

      {myPlots.length > 0 && (
        <div className="card">
          <h3>Post a job (your plots: {myPlots.map((p) => p.code).join(', ')})</h3>
          <button
            onClick={() => {
              const plot = myPlots[0];
              const title = prompt('Job title?', `Staff wanted at ${plot.code}`);
              if (!title) return;
              const wage = Number(prompt('Wage per table collected (coins)?', '5') ?? 0);
              if (!wage || wage < 1) return;
              void act(() =>
                api.createPosting(token!, {
                  plot_id: plot.id,
                  title,
                  description: '',
                  wage_per_task: wage,
                }),
              );
            }}
          >
            + New posting
          </button>
        </div>
      )}

      <div className="card">
        <h3>Open postings ({postings.length})</h3>
        {postings.length === 0 && <p className="muted">Nobody is hiring right now.</p>}
        {postings.map((p) => (
          <div key={p.id} style={{ borderTop: '1px solid #2a3f4d', padding: '10px 0' }}>
            <div className="spread">
              <div>
                <b>{p.title}</b>{' '}
                <span className="muted">
                  · {p.plot_code ?? p.plot_id} · by {p.owner_name ?? '—'} ·{' '}
                  <span className="coins">{p.wage_per_task}/table</span>
                </span>
              </div>
              <div className="row">
                {p.owner_id === me.id ? (
                  <button className="secondary" onClick={() => act(() => api.closePosting(token!, p.id))}>
                    Close
                  </button>
                ) : (
                  <button onClick={() => act(() => api.apply(token!, p.id))}>Apply</button>
                )}
              </div>
            </div>
            {p.owner_id === me.id && (apps[p.id]?.length ?? 0) > 0 && (
              <div style={{ marginTop: 8 }}>
                {apps[p.id].map((a) => (
                  <div className="spread" key={a.id} style={{ padding: '4px 0' }}>
                    <span>
                      {a.staff_name ?? a.staff_id} <span className="muted">· {a.status}</span>
                    </span>
                    <div className="row">
                      {a.status === 'APPLIED' && (
                        <button className="gold" onClick={() => act(() => api.hire(token!, a.id))}>
                          Hire
                        </button>
                      )}
                      {a.status === 'ACTIVE' && (
                        <>
                          <button
                            onClick={() => {
                              const amt = Number(prompt('Tip amount?', '10') ?? 0);
                              if (amt > 0) void act(() => api.tip(token!, a.id, amt));
                            }}
                          >
                            Tip
                          </button>
                          <button
                            className="secondary"
                            onClick={() => {
                              const stars = Number(prompt('Rating 1-5?', '5') ?? 0);
                              if (stars >= 1 && stars <= 5) {
                                const comment = prompt('Comment?') ?? '';
                                void act(() => api.review(token!, a.id, stars, comment));
                              }
                            }}
                          >
                            Review
                          </button>
                          <button
                            className="secondary"
                            onClick={() => act(() => api.endEmployment(token!, a.id))}
                          >
                            End
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <h3>My gigs ({gigs.length})</h3>
        {gigs.length === 0 && <p className="muted">Apply to a posting above to start working.</p>}
        {gigs.map((e) => (
          <div className="spread" key={e.id} style={{ borderTop: '1px solid #2a3f4d', padding: '10px 0' }}>
            <span>
              Shift at plot <b>{e.plot_id.slice(0, 8)}…</b>{' '}
              <span className="muted">
                · {e.status}
                {activeGig(e) ? ' — collect tables on that plot to earn wages' : ''}
              </span>
            </span>
            {e.status !== 'ENDED' && (
              <button className="secondary" onClick={() => act(() => api.endEmployment(token!, e.id))}>
                {e.status === 'APPLIED' ? 'Withdraw' : 'Quit'}
              </button>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
