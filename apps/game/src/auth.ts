import type { User } from '@neon/shared-types';
import { api } from './net/api';

interface Resolved {
  token: string;
  user: User;
}

/**
 * Resolve auth in priority order:
 *  1. handshake from the web shell (postMessage 'neon:auth')
 *  2. ?token= query param
 *  3. guest login against the API
 */
export async function resolveAuth(): Promise<Resolved> {
  const fromParent = await waitForParentAuth(700);
  if (fromParent) return fromParent;

  const qs = new URLSearchParams(window.location.search);
  const qsToken = qs.get('token');
  if (qsToken) {
    const user = await api.me().catch(() => null);
    if (user) return { token: qsToken, user };
  }

  const guest = await api.guest();
  return { token: guest.access_token, user: guest.user };
}

function waitForParentAuth(timeoutMs: number): Promise<Resolved | null> {
  return new Promise((resolve) => {
    if (window.parent === window) {
      resolve(null);
      return;
    }
    const handler = (ev: MessageEvent) => {
      const d = ev.data as { type?: string; access_token?: string; user?: User };
      if (d && d.type === 'neon:auth' && d.access_token && d.user) {
        window.removeEventListener('message', handler);
        resolve({ token: d.access_token, user: d.user });
      }
    };
    window.addEventListener('message', handler);
    window.parent.postMessage({ type: 'neon:game-ready' }, '*');
    window.setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve(null);
    }, timeoutMs);
  });
}
