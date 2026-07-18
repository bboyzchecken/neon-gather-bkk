/** Grid-based A* for the AutoServeBot (Phase 1). Small and dependency-free —
 * the world is 24×24 so a binary heap is unnecessary. */

export interface Cell {
  gx: number;
  gy: number;
}

/** 4-directional A* from start to goal over a cols×rows grid.
 * `blocked` marks impassable tiles (plot interiors). Returns the path
 * INCLUDING the goal, excluding the start; empty when unreachable. */
export function findPath(
  cols: number,
  rows: number,
  blocked: Set<number>,
  start: Cell,
  goal: Cell,
): Cell[] {
  const id = (gx: number, gy: number): number => gy * cols + gx;
  const inBounds = (gx: number, gy: number): boolean => gx >= 0 && gy >= 0 && gx < cols && gy < rows;
  const passable = (gx: number, gy: number): boolean =>
    inBounds(gx, gy) && (!blocked.has(id(gx, gy)) || (gx === goal.gx && gy === goal.gy));

  const sx = Math.round(start.gx);
  const sy = Math.round(start.gy);
  const tx = Math.round(goal.gx);
  const ty = Math.round(goal.gy);
  if (!inBounds(tx, ty)) return [];
  if (sx === tx && sy === ty) return [{ gx: tx, gy: ty }];

  const open: number[] = [id(sx, sy)];
  const came = new Map<number, number>();
  const g = new Map<number, number>([[id(sx, sy), 0]]);
  const h = (gx: number, gy: number): number => Math.abs(gx - tx) + Math.abs(gy - ty);
  const f = new Map<number, number>([[id(sx, sy), h(sx, sy)]]);
  const closed = new Set<number>();

  while (open.length > 0) {
    // pick the open node with the lowest f (linear scan — grid is tiny)
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if ((f.get(open[i]) ?? Infinity) < (f.get(open[bestIdx]) ?? Infinity)) bestIdx = i;
    }
    const current = open.splice(bestIdx, 1)[0];
    if (current === id(tx, ty)) {
      const path: Cell[] = [];
      let node = current;
      while (node !== id(sx, sy)) {
        path.unshift({ gx: node % cols, gy: Math.floor(node / cols) });
        const prev = came.get(node);
        if (prev === undefined) break;
        node = prev;
      }
      return path;
    }
    closed.add(current);
    const cx = current % cols;
    const cy = Math.floor(current / cols);
    const neighbours: Array<[number, number]> = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ];
    for (const [nx, ny] of neighbours) {
      if (!passable(nx, ny)) continue;
      const nid = id(nx, ny);
      if (closed.has(nid)) continue;
      const tentative = (g.get(current) ?? Infinity) + 1;
      if (tentative < (g.get(nid) ?? Infinity)) {
        came.set(nid, current);
        g.set(nid, tentative);
        f.set(nid, tentative + h(nx, ny));
        if (!open.includes(nid)) open.push(nid);
      }
    }
  }
  return [];
}
