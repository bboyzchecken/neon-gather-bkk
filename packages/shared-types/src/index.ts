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
  | { type: 'table_updated'; table: TableView };

/* ============================================================
 * Cross-window handshake (web shell -> embedded game iframe)
 * ============================================================ */
export const GAME_AUTH_MESSAGE = 'neon:auth';
export interface GameAuthMessage {
  type: typeof GAME_AUTH_MESSAGE;
  access_token: string;
  user: User;
}
