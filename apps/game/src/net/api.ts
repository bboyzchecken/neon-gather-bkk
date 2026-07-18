import type { Plot, TableView, User } from '@neon/shared-types';
import { API_URL } from '../config';

let accessToken = '';
export function setToken(t: string): void {
  accessToken = t;
}
export function getToken(): string {
  return accessToken;
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(API_URL + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
    throw new Error(body.error ?? 'request failed');
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  guest: () => req<{ access_token: string; user: User }>('/auth/guest', { method: 'POST' }),
  me: () => req<User>('/users/me'),
  plots: () => req<Plot[]>('/plots'),
  rent: (id: string) => req<Plot>(`/plots/${id}/rent`, { method: 'POST' }),
  tables: () => req<TableView[]>('/tables'),
  order: (id: string) => req<TableView>(`/tables/${id}/order`, { method: 'POST', body: '{}' }),
  collect: (id: string) => req<TableView>(`/tables/${id}/collect`, { method: 'POST' }),
};
