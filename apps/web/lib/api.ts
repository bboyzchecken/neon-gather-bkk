import type { AuthResponse, Item, User, VendorSellResult } from '@neon/shared-types';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
export const GAME_URL = process.env.NEXT_PUBLIC_GAME_URL || 'http://localhost:5173';

async function req<T>(path: string, opts: RequestInit = {}, token?: string): Promise<T> {
  const res = await fetch(API_URL + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  register: (email: string, password: string, display_name: string) =>
    req<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, display_name }),
    }),
  login: (email: string, password: string) =>
    req<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: (token: string) => req<User>('/users/me', {}, token),
  inventory: (token: string) => req<Item[]>('/items/mine', {}, token),
  market: (token: string) => req<Item[]>('/marketplace', {}, token),
  buy: (token: string, id: string) => req<Item>(`/marketplace/${id}/buy`, { method: 'POST' }, token),
  list: (token: string, id: string, price: number) =>
    req<Item>(`/marketplace/${id}/list`, { method: 'POST', body: JSON.stringify({ price }) }, token),
  unlist: (token: string, id: string) =>
    req<Item>(`/marketplace/${id}/unlist`, { method: 'POST' }, token),
  vendorSell: (token: string, id: string) =>
    req<VendorSellResult>(`/items/${id}/vendor-sell`, { method: 'POST' }, token),
};
