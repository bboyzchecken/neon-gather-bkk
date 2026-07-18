'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { AuthResponse } from '@neon/shared-types';
import { GAME_URL } from '../../lib/api';
import { loadAuth } from '../../lib/auth';

export default function Play() {
  const ref = useRef<HTMLIFrameElement>(null);
  const [auth, setAuth] = useState<AuthResponse | null>(null);

  useEffect(() => {
    setAuth(loadAuth());
  }, []);

  useEffect(() => {
    function onMsg(ev: MessageEvent) {
      const d = ev.data as { type?: string };
      if (d?.type === 'neon:game-ready' && auth && ref.current?.contentWindow) {
        ref.current.contentWindow.postMessage(
          { type: 'neon:auth', access_token: auth.access_token, user: auth.user },
          '*',
        );
      }
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [auth]);

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <iframe
        ref={ref}
        src={GAME_URL}
        style={{ border: 'none', width: '100%', height: '100%' }}
        allow="fullscreen"
        title="Neon Gather BKK"
      />
      <Link
        href="/dashboard"
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          background: '#000000aa',
          padding: '6px 12px',
          borderRadius: 8,
        }}
      >
        ← Dashboard
      </Link>
    </div>
  );
}
