export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:5000';

// Top-down render scale (Phase 0). Iso art swaps in later without touching logic.
export const CELL = 44; // px per tile
export const WORLD_COLS = 24;
export const WORLD_ROWS = 24;
export const AVATAR_SPEED = 190; // px/s
