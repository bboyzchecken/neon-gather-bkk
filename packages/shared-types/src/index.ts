/**
 * @neon/shared-types
 * Wire contracts for the Go API (snake_case JSON) consumed by web + game.
 * Framework-free: only types, enums and constants.
 */

/* Building floors (Phase 3) */
export const FLOORS = [
  { floor: 1, name: 'G — The Avenue', theme: 'bar & food court' },
  { floor: 2, name: '2 — Boutique Row', theme: 'quiet shops' },
  { floor: 3, name: '3 — Rooftop Garden', theme: 'open-air chill' },
] as const;

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

/* Phase 2 */
export type CoasterTier = 'STANDARD' | 'SEASONAL' | 'REGULAR' | 'OPENING_NIGHT';

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
  floor: number;
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
  floor: number;
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
  floor: number;
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

export interface CoasterView {
  id: string;
  shop_id: string;
  shop_code: string | null;
  tier: CoasterTier;
  season: string;
  image_url: string | null;
  moderation: ModerationStatus | null;
}

export interface PlayerCoasterView extends CoasterView {
  owned_id: string;
  obtained_at: string;
  listed_for_sale: boolean;
  price: number;
}

export interface ListedCoasterView extends PlayerCoasterView {
  listing_id: string;
  price: number;
  seller_id: string;
  seller_name: string | null;
}

export interface RegularStatusView {
  shop_id: string;
  shop_code: string | null;
  menu_name: string;
  order_count: number;
  threshold: number;
  achieved_at: string | null;
}

export interface CheersPartnerView {
  partner_id: string;
  partner_name: string;
  total_count: number;
  first_cheers_at: string;
}

export interface PassportView {
  stamps: Array<{ menu_name: string; first_tried_at: string }>;
  total_menus: number;
  percent: number;
}

export interface StoryView {
  code: string;
  title: string;
  body: string;
  late_night_only: boolean;
  unlocked_at: string;
}

/* Heart system (§6). is_npc is ALWAYS true — UIs must badge NPCs so they
 * can never be mistaken for real players (iron rule e). */
export interface NpcView {
  id: string;
  is_npc: true;
  name: string;
  bio: string;
  artist_credit: string;
  signature_menu: string;
  shift_start_hour: number;
  shift_end_hour: number;
  on_shift: boolean;
  heart_points: number;
  heart_level: number;
  next_level_at: number;
  talked_today: boolean;
}

export interface NpcStoryNodeView {
  required_level: number;
  title: string;
  story_text?: string;
  reward_type: string;
  unlocked: boolean;
}

export interface NpcDetailView {
  npc: NpcView;
  story_track: NpcStoryNodeView[];
  gift_prefs: Array<{ item_name: string; preference: string }>;
}

export interface NpcActionResult {
  line: string;
  preference?: string;
  heart_points: number;
  heart_level: number;
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
  floor: number;
}

/** Client -> Server (only movement in Phase 0). */
export interface MoveMessage {
  type: 'move';
  x: number;
  y: number;
  dir: Direction;
  floor: number;
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
  | { type: 'vending_low_stock'; machine_id: string; slot_id: string; item_name: string; stock: number }
  // Phase 2
  | { type: 'coaster_granted'; tier: CoasterTier; shop_code: string; coaster_id: string }
  | { type: 'coaster_sold'; listing_id: string; price: number }
  | { type: 'cheers'; from_id: string; from_name: string; total: number }
  | { type: 'regular_achieved'; shop_code: string; menu_name: string }
  | { type: 'bartender_story'; title: string; body: string }
  | { type: 'heart_level_up'; staff_id: string; level: number }
  | { type: 'heart_story'; staff_name: string; title: string; story_text: string };

/* ============================================================
 * Cross-window handshake (web shell -> embedded game iframe)
 * ============================================================ */
export const GAME_AUTH_MESSAGE = 'neon:auth';
export interface GameAuthMessage {
  type: typeof GAME_AUTH_MESSAGE;
  access_token: string;
  user: User;
}
