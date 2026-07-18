'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { PassportView, PhotoView, PlayerCoasterView, StoryView } from '@neon/shared-types';
import { api } from '../../lib/api';
import { loadAuth } from '../../lib/auth';

/** Template art per tier when the shop hasn't uploaded a custom design. */
function coasterArt(c: PlayerCoasterView): string {
  if (c.image_url && c.moderation !== 'REJECTED') return c.image_url;
  return c.tier === 'OPENING_NIGHT'
    ? '/assets/coasters/coaster_opening_01.png'
    : '/assets/coasters/coaster_blank_01.png';
}

export default function Album() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoView[]>([]);
  const [coasters, setCoasters] = useState<PlayerCoasterView[]>([]);
  const [passport, setPassport] = useState<PassportView | null>(null);
  const [stories, setStories] = useState<StoryView[]>([]);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState('');

  const refresh = useCallback(async (t: string) => {
    try {
      const [ps, cs, pp, st] = await Promise.all([
        api.myPhotos(t),
        api.myCoasters(t).catch(() => [] as PlayerCoasterView[]),
        api.passport(t).catch(() => null),
        api.myStories(t).catch(() => [] as StoryView[]),
      ]);
      setPhotos(ps);
      setCoasters(cs);
      setPassport(pp);
      setStories(st);
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

  async function copyShare(p: PhotoView) {
    const url = `${window.location.origin}/p/${p.share_token}`;
    await navigator.clipboard.writeText(url);
    setCopied(p.id);
    setTimeout(() => setCopied(''), 1600);
  }

  return (
    <main className="container">
      <div className="spread">
        <div className="brand">
          📸 <span>Album</span>
        </div>
        <div className="row">
          <Link href="/dashboard">
            <button className="secondary">Dashboard</button>
          </Link>
          <Link href="/play">
            <button>Enter the Avenue</button>
          </Link>
        </div>
      </div>
      <p className="muted">Shots from the photo booth. Share links are public — anyone with the link can view.</p>
      {err && <div className="error">{err}</div>}

      <div className="card">
        <h3>🪙 Coaster collection ({coasters.length})</h3>
        {coasters.length === 0 && (
          <p className="muted">
            Order at any shop&apos;s table to collect its coaster — shops in their first
            7 days also drop a limited opening-night coaster.
          </p>
        )}
        <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
          {coasters.map((c) => (
            <div key={c.owned_id} style={{ textAlign: 'center', width: 104 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coasterArt(c)}
                alt={`${c.tier} coaster`}
                title={`${c.shop_code ?? c.shop_id} · ${c.tier} · ${c.season}`}
                style={{ width: 80, height: 80, opacity: c.listed_for_sale ? 0.55 : 1 }}
              />
              <div className="muted" style={{ fontSize: 11 }}>
                {c.shop_code ?? '—'}
                {c.tier === 'OPENING_NIGHT' ? ' 🥇' : c.tier === 'REGULAR' ? ' ⭐' : ''}
              </div>
              {c.listed_for_sale ? (
                <button
                  className="secondary"
                  style={{ fontSize: 11, padding: '2px 8px' }}
                  onClick={() => {
                    if (!token) return;
                    void api.unlistCoaster(token, c.owned_id).then(() => refresh(token));
                  }}
                >
                  Unlist ({c.price}c)
                </button>
              ) : (
                <button
                  className="secondary"
                  style={{ fontSize: 11, padding: '2px 8px' }}
                  onClick={() => {
                    if (!token) return;
                    const p = Number(prompt('List price (coins)?', '50') ?? 0);
                    if (p >= 1) void api.listCoaster(token, c.owned_id, p).then(() => refresh(token));
                  }}
                >
                  Trade
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {passport && (
        <div className="card">
          <h3>
            🛂 Tasting passport — {passport.stamps.length}/{passport.total_menus} menus (
            {passport.percent}%)
          </h3>
          <div
            style={{
              background: '#22343f',
              borderRadius: 6,
              height: 10,
              margin: '8px 0',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${passport.percent}%`,
                height: '100%',
                background: '#2f6f6a',
              }}
            />
          </div>
          {passport.stamps.length > 0 && (
            <p className="muted" style={{ fontSize: 13 }}>
              {passport.stamps.map((s) => s.menu_name).join(' · ')}
            </p>
          )}
          {passport.stamps.length === 0 && (
            <p className="muted">Order anything at a table to collect your first stamp.</p>
          )}
        </div>
      )}

      {stories.length > 0 && (
        <div className="card">
          <h3>📖 Stories from the bar ({stories.length})</h3>
          {stories.map((s) => (
            <div key={s.code} style={{ borderTop: '1px solid #2a3f4d', padding: '8px 0' }}>
              <b>
                {s.title}
                {s.late_night_only ? ' 🌙' : ''}
              </b>
              <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
                {s.body}
              </p>
            </div>
          ))}
        </div>
      )}

      {photos.length === 0 && (
        <div className="card">
          <p className="muted">
            No photos yet — walk to the 📸 photo booth in the Avenue and press [E]!
          </p>
        </div>
      )}

      <div className="grid">
        {photos.map((p) => (
          <div className="item" key={p.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.url}
              alt={p.caption || 'booth photo'}
              style={{ width: '100%', borderRadius: 10, marginBottom: 8 }}
            />
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              {new Date(p.created_at).toLocaleString()} · backdrop: {p.background || '—'}
              {p.moderation === 'PENDING_REVIEW' ? ' · pending review' : ''}
            </div>
            <div className="row">
              <button onClick={() => void copyShare(p)}>
                {copied === p.id ? 'Copied!' : 'Copy share link'}
              </button>
              <button
                className="secondary"
                onClick={() => {
                  if (!token || !confirm('Delete this photo?')) return;
                  void api.deletePhoto(token, p.id).then(() => refresh(token));
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
