import type {
  AuthResponse,
  CheersPartnerView,
  CoasterView,
  EmploymentView,
  ListedCoasterView,
  Item,
  JobPostingView,
  PhotoView,
  PlayerCoasterView,
  PlayerJob,
  RegularStatusView,
  Plot,
  QuestView,
  SharedPhotoView,
  StaffReviewView,
  User,
  VendorSellResult,
} from '@neon/shared-types';

// Dev default is 5001: macOS AirPlay (ControlCenter) squats on port 5000.
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
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

  // ---- Phase 1 ----
  jobs: (token: string) => req<PlayerJob[]>('/jobs/mine', {}, token),
  quests: (token: string) => req<QuestView[]>('/quests', {}, token),
  claimQuest: (token: string, id: string) =>
    req<{ claimed: boolean; reward_coins: number; balance: number }>(
      `/quests/${id}/claim`,
      { method: 'POST' },
      token,
    ),

  plots: (token: string) => req<Plot[]>('/plots', {}, token),
  postings: (token: string) => req<JobPostingView[]>('/staff/postings', {}, token),
  createPosting: (
    token: string,
    body: { plot_id: string; title: string; description: string; wage_per_task: number },
  ) => req<JobPostingView>('/staff/postings', { method: 'POST', body: JSON.stringify(body) }, token),
  closePosting: (token: string, id: string) =>
    req<JobPostingView>(`/staff/postings/${id}/close`, { method: 'POST' }, token),
  apply: (token: string, postingId: string) =>
    req<EmploymentView>(`/staff/postings/${postingId}/apply`, { method: 'POST' }, token),
  applications: (token: string, postingId: string) =>
    req<EmploymentView[]>(`/staff/postings/${postingId}/applications`, {}, token),
  myEmployments: (token: string) => req<EmploymentView[]>('/staff/employments/mine', {}, token),
  hire: (token: string, employmentId: string) =>
    req<EmploymentView>(`/staff/employments/${employmentId}/hire`, { method: 'POST' }, token),
  endEmployment: (token: string, employmentId: string) =>
    req<EmploymentView>(`/staff/employments/${employmentId}/end`, { method: 'POST' }, token),
  tip: (token: string, employmentId: string, amount: number) =>
    req<{ tipped: number }>(
      `/staff/employments/${employmentId}/tip`,
      { method: 'POST', body: JSON.stringify({ amount }) },
      token,
    ),
  review: (token: string, employmentId: string, stars: number, comment: string) =>
    req<StaffReviewView>(
      `/staff/employments/${employmentId}/review`,
      { method: 'POST', body: JSON.stringify({ stars, comment }) },
      token,
    ),

  myCoasters: (token: string) => req<PlayerCoasterView[]>('/coasters/mine', {}, token),
  shopCoasters: (token: string, plotId: string) =>
    req<CoasterView[]>(`/plots/${plotId}/coasters`, {}, token),
  listCoaster: (token: string, id: string, price: number) =>
    req<{ listed: boolean }>(
      `/coasters/${id}/list`,
      { method: 'POST', body: JSON.stringify({ price }) },
      token,
    ),
  unlistCoaster: (token: string, id: string) =>
    req<{ listed: boolean }>(`/coasters/${id}/unlist`, { method: 'POST' }, token),
  coasterMarket: (token: string) => req<ListedCoasterView[]>('/marketplace/coasters', {}, token),
  buyCoaster: (token: string, listingId: string) =>
    req<{ bought: boolean; price: number }>(
      `/marketplace/coasters/${listingId}/buy`,
      { method: 'POST' },
      token,
    ),
  myRegulars: (token: string) => req<RegularStatusView[]>('/social/regulars/mine', {}, token),
  myCheers: (token: string) => req<CheersPartnerView[]>('/social/cheers/mine', {}, token),

  myPhotos: (token: string) => req<PhotoView[]>('/photos/mine', {}, token),
  deletePhoto: (token: string, id: string) =>
    req<{ deleted: boolean }>(`/photos/${id}`, { method: 'DELETE' }, token),
  sharedPhoto: (tokenParam: string) => req<SharedPhotoView>(`/share/photos/${tokenParam}`),
};
