import type { AuthResponse } from '@neon/shared-types';

const KEY = 'neon_auth';

export function saveAuth(a: AuthResponse): void {
  localStorage.setItem(KEY, JSON.stringify(a));
}

export function loadAuth(): AuthResponse | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as AuthResponse) : null;
}

export function clearAuth(): void {
  localStorage.removeItem(KEY);
}
