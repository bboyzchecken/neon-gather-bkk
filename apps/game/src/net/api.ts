import type {
  NpcActionResult,
  NpcView,
  PhotoView,
  PlayerCoasterView,
  PlayerJob,
  Plot,
  QuestView,
  TableView,
  User,
  VendingMachineView,
} from '@neon/shared-types';
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
  // Phase 1
  jobs: () => req<PlayerJob[]>('/jobs/mine'),
  // Phase 2
  myCoasters: () => req<PlayerCoasterView[]>('/coasters/mine'),
  cheers: (playerID: string) =>
    req<{ total: number }>('/cheers', {
      method: 'POST',
      body: JSON.stringify({ player_id: playerID }),
    }),
  spinGacha: () =>
    req<{ granted: boolean; shop_code: string; refund: number; balance: number }>('/gacha/spin', {
      method: 'POST',
    }),
  npcs: () => req<NpcView[]>('/npc'),
  talkNpc: (id: string) => req<NpcActionResult>(`/npc/${id}/talk`, { method: 'POST' }),
  quests: () => req<QuestView[]>('/quests'),
  vending: () => req<VendingMachineView[]>('/vending'),
  vendingBuy: (slotId: string) =>
    req<{ item: unknown; stock: number }>(`/vending/slots/${slotId}/buy`, { method: 'POST' }),
  uploadPhoto: async (blob: Blob, background: string, caption: string): Promise<PhotoView> => {
    const form = new FormData();
    form.append('file', blob, 'photo.png');
    form.append('background', background);
    form.append('caption', caption);
    const res = await fetch(API_URL + '/photos', {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      body: form,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({ error: res.statusText }))) as {
        error?: string;
      };
      throw new Error(body.error ?? 'upload failed');
    }
    return (await res.json()) as PhotoView;
  },
};
