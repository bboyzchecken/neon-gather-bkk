export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:5000';

// Locked Art & Grid Standards: isometric 2:1, base tile 128×64 px.
export const TILE_W = 128;
export const TILE_H = 64;
export const COLS = 24;
export const ROWS = 24;

/** X offset so every screen coordinate stays positive. */
export const ORIGIN_X = (ROWS * TILE_W) / 2;
export const WORLD_W = ((COLS + ROWS) * TILE_W) / 2;
export const WORLD_H = ((COLS + ROWS) * TILE_H) / 2;

/** Avatar speed in tiles per second (grid units). */
export const SPEED_TILES = 3.4;

/** Grid (tile) coords -> screen pixels. */
export function isoPos(gx: number, gy: number): { x: number; y: number } {
  return {
    x: ORIGIN_X + ((gx - gy) * TILE_W) / 2,
    y: ((gx + gy) * TILE_H) / 2,
  };
}
