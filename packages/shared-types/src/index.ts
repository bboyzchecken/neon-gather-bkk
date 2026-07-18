/**
 * @neon/shared-types
 * Wire contracts for the Go API (snake_case JSON) consumed by web + game.
 * Framework-free: only types, enums and constants.
 */

/* ============================================================
 * Art & Grid Standards (locked — see v2 build prompt §0.1)
 * ============================================================ */
export const GRID = {
  TILE_WIDTH: 128,
  TILE_HEIGHT: 64,
  PLOT_TILES: 4,
  PLOT_FOOTPRINT_W: 512,
  PLOT_FOOTPRINT_H: 256,
  AVATAR_HEIGHT: 110,
  WORLD_COLS: 24,
  WORLD_ROWS: 24,
  FLOOR_HEIGHT: 256,
} as const;

/* ============================================================
 * Enums (kept in sync with the Go models/enums.go constants)
 * ============================================================ */
export type UserRole = 'GUEST' | 'PLAYER' | 'ADMIN';
export type Rarity = 'COMMON' | 'RARE' | 'LEGENDARY';
export type ItemCategory = 'DRINK' | 'FOOD' | 'DECOR' | 'MATERIAL' | 'MISC';
export type PlotStatus = 'VACANT' | 'RENTED';
export type FacadeTemplate = 'CAFE' | 'VINTAGE' | 'STREETFOOD';
export type TableState = 'EMPTY' | 'ORDERED' | 'SERVED' | 'COLLECTED';
export type ModerationStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

/* Phase 1 */
export type JobType = 'VENDOR' | 'MERCHANT' | 'CRAFTER' | 'HOST' | 'EXPLORER';
export type QuestType = 'MAIN' | 'JOB' | 'DAILY' | 'WEEKLY' | 'COMMUNITY';
export type QuestStatus = 'ACTIVE' | 'COMPLETED' | 'CLAIMED';
export type PostingStatus = 'OPEN' | 'CLOSED';
export type EmploymentStatus = 'APPLIED' | 'ACTIVE' | 'ENDED';
export type PhotoType = 'BOOTH' | 'HEART_SPECIAL';

export const ITEM_CATEGORIES: ItemCategory[] = ['DRINK', 'FOOD', 'DECOR', 'MATERIAL', 'MISC'];

/* ============================================================
 * REST DTOs (snake_case — exactly what the Go API returns)
 * ============================================================ */
export interface User {
  id: string;
  email: string | null;
  display_name: string;
  role: UserRole;
  is_guest: boolean;
  coins: number;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: User;
}

export interface Plot {
  id: string;
  code: string;
  grid_x: number;
  grid_y: number;
  width_tiles: number;
  height_tiles: number;
  status: PlotStatus;
  owner_id: string | null;
  owner_name: string | null;
  is_mine: boolean;
  facade_template: FacadeTemplate;
  facade_texture_url: string | null;
  facade_moderation: ModerationStatus | null;
  rent_price: number;
}

export interface Item {
  id: string;
  name: string;
  category: ItemCategory;
  price: number;
  thumbnail_url: string | null;
  rarity: Rarity | null;
  owner_id: string;
  owner_name: string | null;
  listed_for_sale: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  player_id: string;
  display_name: string;
  score: number;
}

export interface TableView {
  id: string;
  code: string;
  grid_x: number;
  grid_y: number;
  state: TableState;
  order_name: string;
  updated_at: string;
}

export interface VendorSellResult {
  earned: number;
  balance: number;
}

/* ============================================================
 * Phase 1 DTOs
 * ============================================================ */
export interface Perk {
  code: string;
  branch: string;
  name: string;
  description: string;
  unlock_level: number;
  effect: string;
  value: number;
}

export interface PlayerJob {
  job_type: JobType;
  xp: number;
  level: number;
  xp_for_next: number;
  unlocked_perks: Perk[];
}

export interface QuestView {
  id: string;
  code: string;
  type: QuestType;
  title: string;
  description: string;
  job_type: JobType | null;
  event: string;
  target: number;
  reward_coins: number;
  reward_job_xp: number;
  period_key: string;
  progress: number;
  status: QuestStatus;
  community_progress?: number;
}

export interface JobPostingView {
  id: string;
  plot_id: string;
  plot_code: string | null;
  owner_id: string;
  owner_name: string | null;
  title: string;
  description: string;
  wage_per_task: number;
  status: PostingStatus;
  created_at: string;
}

export interface EmploymentView {
  id: string;
  posting_id: string;
  plot_id: string;
  staff_id: string;
  staff_name: string | null;
  status: EmploymentStatus;
  applied_at: string;
  hired_at: string | null;
}

export interface StaffReviewView {
  id: string;
  employment_id: string;
  rater_id: string;
  staff_id: string;
  stars: number;
  comment: string;
  created_at: string;
}

export interface VendingSlotView {
  id: string;
  item_name: string;
  category: ItemCategory;
  thumbnail_url: string | null;
  price: number;
  stock: number;
}

export interface VendingMachineView {
  id: string;
  code: string;
  plot_id: string | null;
  owner_id: string;
  owner_name: string | null;
  grid_x: number;
  grid_y: number;
  slots: VendingSlotView[];
}

export interface PhotoView {
  id: string;
  url: string;
  photo_type: PhotoType;
  background: string;
  caption: string;
  share_token: string;
  moderation: ModerationStatus;
  created_at: string;
}

export interface SharedPhotoView {
  url: string;
  caption: string;
  background: string;
  photo_type: PhotoType;
  owner_name: string;
  created_at: string;
}

/* ============================================================
 * Realtime (native WebSocket JSON protocol) — GET /ws?token=...
 * ============================================================ */
export type Direction = 'up' | 'down' | 'left' | 'right';

export interface PlayerState {
  id: string;
  display_name: string;
  x: number;
  y: number;
  dir: Direction;
}

/** Client -> Server (only movement in Phase 0). */
export interface MoveMessage {
  type: 'move';
  x: number;
  y: number;
  dir: Direction;
}

/** Server -> Client messages, discriminated by `type`. */
export type ServerMessage =
  | { type: 'snapshot'; players: PlayerState[]; tables: TableView[] }
  | { type: 'player_joined'; player: PlayerState }
  | { type: 'player_left'; id: string }
  | { type: 'player_moved'; player: PlayerState }
  | { type: 'table_updated'; table: TableView }
  // Phase 1
  | { type: 'job_level_up'; job_type: JobType; level: number }
  | { type: 'quest_completed'; quest_id: string; code: string; title: string }
  | { type: 'order_alert'; table_id: string; table_code: string; plot_id: string; order_name: string }
  | { type: 'staff_applied'; posting_id: string; employment_id: string }
  | { type: 'staff_hired'; employment_id: string; plot_id: string }
  | { type: 'tip_received'; amount: number; employment_id: string }
  | { type: 'wage_paid'; amount: number; table_code: string }
  | { type: 'vending_updated'; machine_id: string; slot_id: string; stock: number }
  | { type: 'vending_low_stock'; machine_id: string; slot_id: string; item_name: string; stock: number };

/* ============================================================
 * Cross-window handshake (web shell -> embedded game iframe)
 * ============================================================ */
export const GAME_AUTH_MESSAGE = 'neon:auth';
export interface GameAuthMessage {
  type: typeof GAME_AUTH_MESSAGE;
  access_token: string;
  user: User;
}
