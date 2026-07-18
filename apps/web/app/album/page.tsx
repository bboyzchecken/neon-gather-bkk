'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { PhotoView } from '@neon/shared-types';
import { api } from '../../lib/api';
import { loadAuth } from '../../lib/auth';

export default function Album() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoView[]>([]);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState('');

  const refresh = useCallback(async (t: string) => {
    try {
      setPhotos(await api.myPhotos(t));
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
