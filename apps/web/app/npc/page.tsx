'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { Item, NpcDetailView, NpcView } from '@neon/shared-types';
import { api } from '../../lib/api';
import { loadAuth } from '../../lib/auth';

/** Heart system (§6). NPCs carry an explicit ☆ STORY CHARACTER badge —
 * hearts exist ONLY for these designed characters, never real players. */
export default function NpcPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [npcs, setNpcs] = useState<NpcView[]>([]);
  const [detail, setDetail] = useState<NpcDetailView | null>(null);
  const [inv, setInv] = useState<Item[]>([]);
  const [line, setLine] = useState('');
  const [err, setErr] = useState('');

  const refresh = useCallback(async (t: string) => {
    try {
      const [ns, items] = await Promise.all([api.npcs(t), api.inventory(t)]);
      setNpcs(ns);
      setInv(items.filter((i) => !i.listed_for_sale));
      if (ns.length > 0) setDetail(await api.npcDetail(t, ns[0].id));
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

  async function act(fn: () => Promise<{ line: string }>) {
    if (!token) return;
    setErr('');
    try {
      const res = await fn();
      setLine(res.line);
      await refresh(token);
    } catch (ex) {
      setErr((ex as Error).message);
      setLine('');
    }
  }

  const npc = detail?.npc;

  return (
    <main className="container">
      <div className="spread">
        <div className="brand">
          💛 <span>The Bar</span>
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
      <p className="muted">
        Hearts are for <b>story characters only</b> — real players connect through tips, reviews
        and cheers instead.
      </p>
      {err && <div className="error">{err}</div>}
      {line && (
        <div className="card" style={{ borderLeft: '4px solid #d08bb0' }}>
          <p style={{ margin: 0 }}>{line}</p>
        </div>
      )}

      {npcs.length === 0 && (
        <div className="card">
          <p className="muted">No characters yet this season.</p>
        </div>
      )}

      {npc && (
        <div className="card">
          <div className="spread">
            <h3 style={{ margin: 0 }}>
              {npc.name} <span className="pill">☆ STORY CHARACTER</span>
            </h3>
            <span className={npc.on_shift ? 'coins' : 'muted'}>
              {npc.on_shift
                ? '● on shift now'
                : `shift ${npc.shift_start_hour}:00–${npc.shift_end_hour}:00`}
            </span>
          </div>
          <p className="muted">{npc.bio}</p>
          <p className="muted" style={{ fontSize: 12 }}>
            Signature order: <b>{npc.signature_menu}</b> · art: {npc.artist_credit}
          </p>

          <div className="spread" style={{ margin: '10px 0 4px' }}>
            <b>
              💛 Level {npc.heart_level}
              {npc.heart_level >= 10 ? ' (MAX)' : ''}
            </b>
            <span className="muted">
              {npc.heart_points}
              {npc.next_level_at > 0 ? ` / ${npc.next_level_at}` : ''} pts
            </span>
          </div>
          <div style={{ background: '#22343f', borderRadius: 6, height: 10, overflow: 'hidden' }}>
            <div
              style={{
                width: `${
                  npc.next_level_at > 0
                    ? Math.min(100, Math.round((npc.heart_points / npc.next_level_at) * 100))
                    : 100
                }%`,
                height: '100%',
                background: '#d08bb0',
              }}
            />
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <button disabled={!npc.on_shift || npc.talked_today} onClick={() => act(() => api.npcTalk(token!, npc.id))}>
              {npc.talked_today ? 'Talked today ✔' : '💬 Talk (daily)'}
            </button>
            <button
              className="secondary"
              disabled={!npc.on_shift}
              onClick={() => {
                const amt = Number(prompt('Tip (coins)?', '10') ?? 0);
                if (amt >= 1) void act(() => api.npcTip(token!, npc.id, amt));
              }}
            >
              Tip
            </button>
            <button
              className="secondary"
              disabled={!npc.on_shift || inv.length === 0}
              onClick={() => {
                const names = inv.map((i, idx) => `${idx + 1}) ${i.name}`).join('\n');
                const pick = Number(prompt(`Gift which item?\n${names}`, '1') ?? 0);
                const item = inv[pick - 1];
                if (item) void act(() => api.npcGift(token!, npc.id, item.id));
              }}
            >
              🎁 Gift
            </button>
          </div>
          {!npc.on_shift && (
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Come back during shift hours to talk, tip or gift.
            </p>
          )}
        </div>
      )}

      {detail && (
        <div className="card">
          <h3>Story track</h3>
          {detail.story_track.map((n) => (
            <div key={n.required_level} style={{ borderTop: '1px solid #2a3f4d', padding: '8px 0' }}>
              <div className="spread">
                <b>
                  {n.unlocked ? '💛' : '🔒'} Lv.{n.required_level} — {n.title}
                </b>
                <span className="muted" style={{ fontSize: 12 }}>
                  {n.reward_type}
                </span>
              </div>
              {n.unlocked && n.story_text && (
                <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
                  {n.story_text}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {detail && detail.gift_prefs.length > 0 && (
        <div className="card">
          <h3>Gift hints</h3>
          <p className="muted" style={{ fontSize: 13 }}>
            {detail.gift_prefs
              .map(
                (p) =>
                  `${p.preference === 'LOVED' ? '💖' : p.preference === 'LIKED' ? '🙂' : p.preference === 'DISLIKED' ? '😅' : '·'} ${p.item_name}`,
              )
              .join('  ·  ')}
          </p>
        </div>
      )}
    </main>
  );
}
