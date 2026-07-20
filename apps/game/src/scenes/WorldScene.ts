import Phaser from 'phaser';
import type {
  Direction,
  NpcView,
  PlayerState,
  Plot,
  QuestView,
  ServerMessage,
  TableView,
  User,
  VendingMachineView,
} from '@neon/shared-types';
import { facadeKey } from '../assets';
import { COLS, ROWS, SPEED_TILES, TILE_H, TILE_W, WORLD_H, WORLD_W, isoPos } from '../config';
import { api } from '../net/api';
import { connectWorld, type WorldSocket } from '../net/socket';
import { findPath, type Cell } from '../pathfind';

interface PlotView {
  plot: Plot;
  outline: Phaser.GameObjects.Graphics;
  zone: Phaser.GameObjects.Zone;
  facade?: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
}
interface TableViewObj {
  table: TableView;
  sprite?: Phaser.GameObjects.Image;
  fallback?: Phaser.GameObjects.Rectangle;
  badge: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
}

/** Offline preview data (mirrors the seeder's wall-to-wall mall layout). */
const DEMO_SLOTS: Array<[number, number, number]> = [
  [1, 2, 1], [1, 6, 1], [1, 14, 1], [1, 18, 1], // G: top wall, flanking the entrance
  [1, 1, 6], [1, 1, 10], // G: left wall
  [2, 2, 1], [2, 6, 1], [2, 14, 1], [2, 18, 1], // floor 2 boutique row
];
const DEMO_PLOTS: Plot[] = DEMO_SLOTS.map(([floor, gx, gy], i) => {
  const templates = ['CAFE', 'VINTAGE', 'STREETFOOD'] as const;
  const rented = i === 1 || i === 4;
  return {
    id: `demo-${i}`,
    code: `${floor === 1 ? 'A' : 'B'}-0${(i % 6) + 1}`,
    floor,
    grid_x: gx,
    grid_y: gy,
    width_tiles: 4,
    height_tiles: 4,
    status: rented ? 'RENTED' : 'VACANT',
    owner_id: rented ? 'npc' : null,
    owner_name: rented ? (i === 1 ? 'Mali' : 'Krit') : null,
    is_mine: false,
    facade_template: templates[i % 3],
    facade_texture_url: null,
    facade_moderation: null,
    rent_price: 200,
  };
});

const DEMO_TABLES: TableView[] = (['EMPTY', 'ORDERED', 'SERVED', 'COLLECTED'] as const).map(
  (state, i) => ({
    id: `demo-t-${i}`,
    code: `T-0${i + 1}`,
    floor: 1,
    grid_x: 6 + i * 2,
    grid_y: 16,
    state,
    order_name: state === 'EMPTY' ? '' : 'House Special',
    updated_at: '',
  }),
);

/** Offline preview vending machine (mirrors the seeder). */
const DEMO_VENDING: VendingMachineView[] = [
  {
    id: 'demo-v',
    code: 'V-01',
    plot_id: null,
    owner_id: 'npc',
    owner_name: 'Avenue Market',
    floor: 1,
    grid_x: 18,
    grid_y: 16,
    slots: [
      { id: 'demo-s1', item_name: 'Iced Thai Tea', category: 'DRINK', thumbnail_url: null, price: 30, stock: 10 },
      { id: 'demo-s2', item_name: 'Cold Brew Coffee', category: 'DRINK', thumbnail_url: null, price: 40, stock: 10 },
      { id: 'demo-s3', item_name: 'Mango Smoothie', category: 'DRINK', thumbnail_url: null, price: 50, stock: 8 },
      { id: 'demo-s4', item_name: 'Slice of Cake', category: 'FOOD', thumbnail_url: null, price: 35, stock: 6 },
    ],
  },
];

/** Photo-booth placement (2×2 tiles per the Art & Grid Standards). */
const BOOTH = { gx: 20, gy: 18, w: 2, h: 2 };

/** Interior shell: perimeter wall height + entrance bay on the gy=0 wall. */
const WALL_H = 170;
const ENTRANCE = { start: 10, width: 4 };

/** Display cabinet (Phase 2 §1) — shows your coaster collection. */
const CABINET = { gx: 22, gy: 15 };

/** Chill lounge courtyard under the skylight (sofa + rug + gachapon). */
const LOUNGE = { gx: 17.5, gy: 9.5 };
const GACHA = { gx: 20.5, gy: 10.5 };

/** Phase 3 — vertical transport spots (same on every floor). */
const ELEVATOR = { gx: 22.6, gy: 1.15 };
const STAIRS = { gx: 1.4, gy: 15.5 };
const FLOOR_NAMES: Record<number, string> = {
  1: 'G · The Avenue',
  2: '2 · Boutique Row',
  3: '3 · Rooftop Garden',
};

/** Day/night phase from the clock (server TZ == local here); ?tod= overrides
 * for testing. Night mode = tint overlay + emissive accents per D0.6. */
type TimePhase = 'day' | 'dusk' | 'night';
function timePhase(): TimePhase {
  const qs = new URLSearchParams(window.location.search).get('tod');
  if (qs === 'day' || qs === 'dusk' || qs === 'night') return qs;
  const h = new Date().getHours();
  if (h >= 6 && h < 17) return 'day';
  if (h >= 17 && h < 19) return 'dusk';
  return 'night';
}
const SKY_COLOR: Record<TimePhase, number> = { day: 0x8fbcd6, dusk: 0x4a3050, night: 0x0b1424 };

/** AutoServeBot home position (beside the bar counter). */
const BOT_HOME: Cell = { gx: 14, gy: 17 };
const BOT_SPEED_TILES = 2.6;

/** D3.5 — Sims-style open neighbourhood: the hall is a lot on a living soi.
 * EXT = tiles of surroundings drawn past the playable grid; CAM = extra
 * camera margin so the street/skyline is visible from the world edges. */
const EXT = 8;
const CAM = { top: 320, side: 380, bottom: 300 };

/** D3.6 — per-floor elevation: everything outside SINKS as you go up, so a
 * floor change reads as real height. Ground level 0; floor 2 puts the soi
 * ~one storey below; floor 3 drops the neighbours so only rooflines peek
 * over the parapet. FAR_DROP shifts the hazy skyline less (parallax). */
const FLOOR_DROP: Record<number, number> = { 1: 0, 2: 110, 3: 440 };
const FAR_DROP: Record<number, number> = { 1: 0, 2: 55, 3: 170 };

/** Street furniture on the soi (front edges). Grid coords, may exceed COLS/ROWS. */
const LAMPS: Array<[number, number]> = [
  [2, ROWS + 1.35], [8, ROWS + 1.35], [16, ROWS + 1.35], [22, ROWS + 1.35],
  [COLS + 1.35, 2], [COLS + 1.35, 8], [COLS + 1.35, 16], [COLS + 1.35, 22],
];
const STREET_TREES: Array<[number, number]> = [
  [4.5, ROWS + 6.3], [12.3, ROWS + 6.7], [20.6, ROWS + 6.2],
  [COLS + 6.4, 5.3], [COLS + 6.8, 13.6], [COLS + 6.2, 20.5],
];
/** Rooftop billboard on a neighbour block — neon shapes only, no lettering. */
const BILLBOARD = { gx0: 16.6, gx1: 20.4, gy: -2.4, h: 330 };

/** Neighbour buildings behind the two back walls (Thonglor shophouse row +
 * a couple of condo towers). u0/u1 run along the edge in tiles; off = tiles
 * behind the wall; h = facade height px. */
interface NeighborBlock { u0: number; u1: number; off: number; h: number; c: number; tower?: boolean; tank?: boolean }
const BLOCKS_NE: NeighborBlock[] = [
  { u0: -3, u1: 2, off: 1.2, h: 230, c: 0xd8c6ae },
  { u0: 2.4, u1: 5.6, off: 1.4, h: 300, c: 0xc9967a },
  { u0: 6, u1: 9.6, off: 1.2, h: 252, c: 0xbfcabf, tank: true },
  { u0: 10, u1: 11.6, off: 1.7, h: 440, c: 0xa4b4bc, tower: true },
  { u0: 12, u1: 16.2, off: 1.3, h: 268, c: 0xd6c2a4 },
  { u0: 16.6, u1: 20.4, off: 1.4, h: 236, c: 0xc7b49a },
  { u0: 20.8, u1: 27, off: 1.2, h: 288, c: 0xb9a58f },
];
const BLOCKS_NW: NeighborBlock[] = [
  { u0: -3, u1: 2, off: 1.3, h: 262, c: 0xcdbba1 },
  { u0: 2.4, u1: 6, off: 1.4, h: 336, c: 0xbe9a80, tank: true },
  { u0: 6.4, u1: 8.2, off: 1.7, h: 470, c: 0x9fadb5, tower: true },
  { u0: 8.6, u1: 12.6, off: 1.2, h: 250, c: 0xd2c0a8 },
  { u0: 13, u1: 17, off: 1.5, h: 302, c: 0xc2ae94 },
  { u0: 17.4, u1: 22, off: 1.2, h: 232, c: 0xd0bfa6 },
  { u0: 22.4, u1: 27, off: 1.4, h: 276, c: 0xbaa88e },
];
/** Hazy far row — a second, taller skyline layer behind the blocks. */
const FAR_NE: NeighborBlock[] = [
  { u0: -2, u1: 6, off: 4, h: 520, c: 0 },
  { u0: 8, u1: 13, off: 4.6, h: 610, c: 0 },
  { u0: 14.5, u1: 21, off: 4.2, h: 560, c: 0 },
  { u0: 22, u1: 28, off: 3.8, h: 480, c: 0 },
];
const FAR_NW: NeighborBlock[] = [
  { u0: -2, u1: 4, off: 4.2, h: 560, c: 0 },
  { u0: 5.5, u1: 11, off: 4.6, h: 640, c: 0 },
  { u0: 12.5, u1: 18, off: 4, h: 500, c: 0 },
  { u0: 19, u1: 27, off: 4.4, h: 580, c: 0 },
];

const PHOTO_BACKDROPS: Array<{ name: string; color: number }> = [
  { name: 'cream', color: 0xf2e3c8 },
  { name: 'teal', color: 0x2f6f6a },
  { name: 'terracotta', color: 0xc97f56 },
];

export class WorldScene extends Phaser.Scene {
  private me!: User;
  private token = '';
  private offline = false;
  private coins = 0;
  private ws?: WorldSocket;

  private avatar!: Phaser.GameObjects.Container;
  private pos = { gx: COLS / 2, gy: ROWS / 2 };
  private dir: Direction = 'down';
  private others = new Map<string, { c: Phaser.GameObjects.Container; gx: number; gy: number }>();

  private groundRT?: Phaser.GameObjects.RenderTexture;
  private plotViews: PlotView[] = [];
  private tableViews = new Map<string, TableViewObj>();

  private hud!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  private lastSent = 0;
  private nearTableId?: string;
  private busy = false;

  // ---- Phase 1 state ----
  private vendingViews = new Map<string, { m: VendingMachineView; sprite?: Phaser.GameObjects.Image }>();
  private nearMachineId?: string;
  private vendingPanel?: Phaser.GameObjects.Container;
  private nearBooth = false;
  private photoMode = false;
  private photoBackdropIdx = 0;
  private photoBackdrop?: Phaser.GameObjects.Rectangle;
  private quests: QuestView[] = [];
  private questPanel?: Phaser.GameObjects.Container;
  private questPanelVisible = true;
  private ambientG?: Phaser.GameObjects.Graphics;
  private nearCabinet = false;
  private coasterPanel?: Phaser.GameObjects.Container;
  private nearPlayerId?: string;
  private nearGacha = false;
  private npcs: NpcView[] = [];
  private npcActor?: Phaser.GameObjects.Container;
  private nearNpcId?: string;
  private floor = 1;
  private phase: TimePhase = 'day';
  private nearLift = false;
  private floorPanel?: Phaser.GameObjects.Container;
  private blockedTiles = new Set<number>();
  private bot?: Phaser.GameObjects.Container;
  private botPos: Cell = { ...BOT_HOME };
  private botPath: Cell[] = [];
  private botState: 'idle' | 'serving' | 'cleaning' | 'returning' = 'idle';
  private botQueue: Array<{ target: Cell; kind: 'serving' | 'cleaning' }> = [];

  constructor() {
    super('World');
  }

  init(data: { me: User; token: string; offline?: boolean; floor?: number }): void {
    this.me = data.me;
    this.token = data.token;
    this.offline = data.offline ?? false;
    this.coins = data.me.coins;
    this.floor = data.floor ?? 1;
    this.phase = timePhase();
    // arriving on a floor puts you by the elevator (or hall centre on G)
    this.pos =
      this.floor === 1
        ? { gx: COLS / 2, gy: ROWS / 2 }
        : { gx: ELEVATOR.gx - 1.6, gy: ELEVATOR.gy + 1.8 };
    // scene.restart leaves old references around — reset per-floor state
    this.plotViews = [];
    this.tableViews = new Map();
    this.vendingViews = new Map();
    this.others = new Map();
    this.blockedTiles = new Set();
    this.botQueue = [];
    this.botPath = [];
    this.botState = 'idle';
    this.botPos = { ...BOT_HOME };
    this.bot = undefined;
    this.npcActor = undefined;
    this.coasterPanel = undefined;
    this.vendingPanel = undefined;
    this.floorPanel = undefined;
    this.questPanel = undefined;
    this.ambientG = undefined;
    this.groundRT = undefined;
    this.photoMode = false;
    this.photoBackdrop = undefined;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(SKY_COLOR[this.phase]);
    this.drawSurroundings();
    this.drawGround();
    if (this.floor === 3) {
      this.drawRooftopShell();
    } else {
      this.drawInteriorShell();
    }
    this.drawDecor();
    this.createAvatar();
    this.createHud();
    this.drawAmbient();
    this.setupInput();
    // perimeter wall tiles are impassable for the AutoServeBot
    for (let gx = 0; gx < COLS; gx++) this.blockedTiles.add(gx);
    for (let gy = 0; gy < ROWS; gy++) this.blockedTiles.add(gy * COLS);
    // margins let the camera show the soi + skyline past the lot (D3.5)
    this.cameras.main.setBounds(
      -CAM.side,
      -CAM.top,
      WORLD_W + CAM.side * 2,
      WORLD_H + CAM.top + CAM.bottom,
    );
    this.cameras.main.startFollow(this.avatar, true, 0.1, 0.1);

    if (this.floor === 1) {
      this.placePhotoBooth();
      this.createBot();
    }
    this.placeLifts();
    this.createQuestPanel();

    if (this.offline) {
      DEMO_PLOTS.filter((p) => p.floor === this.floor).forEach((p) => this.drawPlot(p));
      if (this.floor === 1) {
        DEMO_TABLES.forEach((t) => this.upsertTable(t));
        DEMO_VENDING.forEach((m) => this.upsertVending(m));
        // let the bot demo its serve/clean walk on the preview tables
        DEMO_TABLES.forEach((t) => this.onTableForBot(t));
      }
      this.toast('Offline preview — start the API for full play', 0x8a5a2b);
    } else {
      void this.loadPlots();
      void this.loadVending();
      void this.loadQuests();
      if (this.floor === 1) void this.loadNpcs();
      this.connectSocket();
      // announce our floor right away so others filter us correctly
      this.time.delayedCall(600, () =>
        this.ws?.sendMove(this.pos.gx, this.pos.gy, this.dir, this.floor),
      );
    }
    // re-light when the time-of-day phase flips (day → dusk → night)
    this.time.addEvent({
      delay: 60_000,
      loop: true,
      callback: () => {
        if (timePhase() !== this.phase) {
          this.scene.restart({
            me: this.me,
            token: this.token,
            offline: this.offline,
            floor: this.floor,
          });
        }
      },
    });
    this.events.once('shutdown', () => this.ws?.close());
  }

  /** Elevator + stairs (same spots on every floor) — [E] opens the panel. */
  private placeLifts(): void {
    this.placeProp('elevator', ELEVATOR.gx, ELEVATOR.gy + 0.9, TILE_W * 1.05);
    this.placeProp('stairs', STAIRS.gx + 0.4, STAIRS.gy + 0.6, TILE_W * 1.5);
    const label = (gx: number, gy: number, text: string): void => {
      const c = isoPos(gx, gy);
      this.add
        .text(c.x, c.y + TILE_H * 0.35, text, {
          color: '#ffffff',
          fontSize: '12px',
          backgroundColor: '#00000099',
          padding: { x: 4, y: 1 },
        })
        .setOrigin(0.5, 0)
        .setDepth(9000);
    };
    label(ELEVATOR.gx, ELEVATOR.gy + 1, `🛗 ${FLOOR_NAMES[this.floor]}`);
    label(STAIRS.gx + 0.4, STAIRS.gy + 0.8, '🪜 stairs');
  }

  private closeFloorPanel(): void {
    this.floorPanel?.destroy();
    this.floorPanel = undefined;
  }

  private openFloorPanel(): void {
    this.closeFloorPanel();
    const lines = [1, 2, 3].map(
      (f) => `[${f}] ${FLOOR_NAMES[f]}${f === this.floor ? '  ← here' : ''}`,
    );
    const w = 280;
    const h = 64 + lines.length * 24;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.18);
    g.fillRoundedRect(4, 6, w, h, 14);
    g.fillStyle(0xf5ead7, 0.97);
    g.lineStyle(3, 0x1e3d34, 1);
    g.fillRoundedRect(0, 0, w, h, 14);
    g.strokeRoundedRect(0, 0, w, h, 14);
    const title = this.add.text(14, 10, '🛗 Where to?', {
      color: '#1e3d34',
      fontSize: '15px',
      fontStyle: 'bold',
    });
    const items = this.add.text(14, 38, lines.join('\n'), {
      color: '#41372a',
      fontSize: '13px',
      lineSpacing: 10,
    });
    const foot = this.add.text(14, h - 20, 'press 1-3 · [E] close', {
      color: '#8a5a2b',
      fontSize: '11px',
    });
    this.floorPanel = this.add
      .container(this.scale.width / 2 - w / 2, this.scale.height / 2 - h / 2, [
        g,
        title,
        items,
        foot,
      ])
      .setScrollFactor(0)
      .setDepth(10001);
  }

  private switchFloor(target: number): void {
    if (target === this.floor || target < 1 || target > 3) {
      this.closeFloorPanel();
      return;
    }
    this.scene.restart({ me: this.me, token: this.token, offline: this.offline, floor: target });
  }

  private tex(key: string): boolean {
    return this.textures.exists(key);
  }

  // ---------- iso floor tiles ----------
  /** Build a 128×64 diamond tile texture from a flat square floor texture. */
  private makeIsoFloor(srcKey: string): string | null {
    const isoKey = `${srcKey}_iso`;
    if (this.tex(isoKey)) return isoKey;
    if (!this.tex(srcKey)) return null;

    const side = TILE_W / Math.SQRT2; // rotated square fits a 128px bounding box
    const rot = this.make.renderTexture({ width: TILE_W, height: TILE_W }, false);
    const img = this.make.image({ key: srcKey, add: false });
    img.setDisplaySize(side, side).setOrigin(0.5).setRotation(Math.PI / 4);
    rot.draw(img, TILE_W / 2, TILE_W / 2);
    rot.saveTexture(`${srcKey}_rot`);

    const squash = this.make.renderTexture({ width: TILE_W, height: TILE_H }, false);
    const img2 = this.make.image({ key: `${srcKey}_rot`, add: false });
    img2.setOrigin(0.5).setScale(1, 0.5);
    squash.draw(img2, TILE_W / 2, TILE_H / 2);
    squash.saveTexture(isoKey);
    img.destroy();
    img2.destroy();
    return isoKey;
  }

  /** Blit diamond floor tiles for a tile range into the ground render texture. */
  private blitFloor(isoKey: string, x0: number, y0: number, w: number, h: number): void {
    if (!this.groundRT) return;
    const stamp = this.make.image({ key: isoKey, add: false });
    stamp.setOrigin(0.5);
    for (let gy = y0; gy < y0 + h; gy++) {
      for (let gx = x0; gx < x0 + w; gx++) {
        const c = isoPos(gx + 0.5, gy + 0.5);
        this.groundRT.draw(stamp, c.x, c.y);
      }
    }
    stamp.destroy();
  }

  private drawGround(): void {
    // Per-floor materials: G = concrete hall + terracotta walkways,
    // 2 = warm teak boutique level + concrete corridor,
    // 3 = rooftop concrete deck + terracotta garden paths.
    const conc = this.makeIsoFloor('floor_concrete');
    const terra = this.makeIsoFloor('floor_terracotta');
    const teak = this.makeIsoFloor('floor_teak');
    if (conc || terra || teak) {
      this.groundRT = this.add.renderTexture(0, 0, WORLD_W, WORLD_H).setOrigin(0).setDepth(0);
      const base = this.floor === 2 ? teak : conc;
      const path = this.floor === 2 ? conc : terra;
      if (base) this.blitFloor(base, 0, 0, COLS, ROWS);
      if (path) {
        this.blitFloor(path, ENTRANCE.start, 1, ENTRANCE.width, ROWS - 1);
        this.blitFloor(path, 1, 14, COLS - 1, 4);
        // walkway continues out the front gate to the soi's sidewalk (D3.5)
        if (this.floor === 1) this.blitFloor(path, ENTRANCE.start, ROWS, ENTRANCE.width, 2);
      }
      if (this.floor === 1) this.drawCheckerCourt();
    } else {
      // fallback: flat-shaded diamonds
      const g = this.add.graphics().setDepth(0);
      for (let gy = 0; gy < ROWS; gy++) {
        for (let gx = 0; gx < COLS; gx++) {
          g.fillStyle((gx + gy) % 2 === 0 ? 0xc9bda4 : 0xd4c8b0, 1);
          this.fillDiamond(g, gx, gy);
        }
      }
    }
  }

  // ---------- interior shell (walls, entrance, lights, ambience) ----------
  /** Product direction: the world reads as the INSIDE of one building —
   * perimeter walls with columns/windows, a glass entrance, string lights
   * and a warm dim — not an open outdoor plaza. */
  private drawInteriorShell(): void {
    const g = this.add.graphics().setDepth(1);

    // point u∈[0..1] along base a→b, lifted h px off the floor
    const P = (
      a: { x: number; y: number },
      b: { x: number; y: number },
      u: number,
      h: number,
    ): Phaser.Geom.Point =>
      new Phaser.Geom.Point(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u - h);
    const quad = (
      a: { x: number; y: number },
      b: { x: number; y: number },
      u0: number,
      u1: number,
      h0: number,
      h1: number,
      color: number,
      alpha = 1,
    ): void => {
      g.fillStyle(color, alpha);
      g.fillPoints([P(a, b, u0, h1), P(a, b, u1, h1), P(a, b, u1, h0), P(a, b, u0, h0)], true);
    };

    // one wall bay on the base segment a→b
    const bay = (
      a: { x: number; y: number },
      b: { x: number; y: number },
      face: number,
      kind: 'plain' | 'window' | 'door',
    ): void => {
      quad(a, b, 0, 1, 0, WALL_H, face); // face
      if (kind === 'window') {
        quad(a, b, 0.2, 0.8, 74, 148, 0x1e3d34); // frame
        if (this.phase === 'night') {
          // emissive layer: windows glow warm after dark (D0.6 night mode)
          quad(a, b, 0.24, 0.76, 80, 142, 0xffdf9e, 0.9);
          quad(a, b, 0.24, 0.76, 80, 111, 0xfff3d0, 0.5);
        } else if (this.phase === 'dusk') {
          quad(a, b, 0.24, 0.76, 80, 142, 0xf0b48a, 0.9);
          quad(a, b, 0.24, 0.76, 80, 111, 0xffd9b0, 0.5);
        } else {
          quad(a, b, 0.24, 0.76, 80, 142, 0x9fd3cd, 0.95); // glass
          quad(a, b, 0.24, 0.76, 80, 111, 0xc3e6e1, 0.5); // sky sheen
        }
      }
      if (kind === 'door') {
        quad(a, b, 0.04, 0.96, 0, 152, 0x1e3d34); // door frame
        quad(a, b, 0.08, 0.49, 6, 146, 0xffe9b0, 0.92); // glass, daylight behind
        quad(a, b, 0.51, 0.92, 6, 146, 0xffe9b0, 0.92);
        quad(a, b, 0.08, 0.92, 96, 104, 0x1e3d34); // push bar
      }
      quad(a, b, 0, 1, 0, 14, 0x8a5a2b); // teak baseboard
      quad(a, b, 0, 1, WALL_H - 8, WALL_H, 0x16302a); // cornice
    };
    const column = (a: { x: number; y: number }, b: { x: number; y: number }): void => {
      quad(a, b, -0.06, 0.06, 0, WALL_H + 6, 0x1e3d34);
    };

    // north-east wall (gy = 0) with the entrance doors — windows every other
    // bay keep the room airy (chill-lounge direction). Doors only on G.
    for (let gx = 0; gx < COLS; gx++) {
      const a = isoPos(gx, 0);
      const b = isoPos(gx + 1, 0);
      const inDoor =
        this.floor === 1 && gx >= ENTRANCE.start && gx < ENTRANCE.start + ENTRANCE.width;
      bay(a, b, 0xe6d5b8, inDoor ? 'door' : gx % 2 === 0 ? 'window' : 'plain');
    }
    // north-west wall (gx = 0)
    for (let gy = 0; gy < ROWS; gy++) {
      const a = isoPos(0, gy);
      const b = isoPos(0, gy + 1);
      bay(a, b, 0xf2e6cf, gy % 2 === 0 ? 'window' : 'plain');
    }
    // columns every 4 tiles + the corner
    for (let gx = 0; gx <= COLS; gx += 4) {
      column(isoPos(gx, 0), isoPos(gx + 1, 0));
    }
    for (let gy = 4; gy <= ROWS; gy += 4) {
      column(isoPos(0, gy), isoPos(0, gy + 1));
    }

    if (this.floor === 1) {
      // warm light spill on the floor inside the entrance
      const doorMid = isoPos(ENTRANCE.start + ENTRANCE.width / 2, 0.9);
      g.fillStyle(0xffdf9e, this.phase === 'night' ? 0.2 : 0.12);
      g.fillEllipse(doorMid.x, doorMid.y + 26, TILE_W * 3.4, TILE_H * 2.6);

      // skylight light-well over the lounge courtyard — daylight (or
      // moonlight) pooling keeps the enclosed hall feeling open and chill
      const sky = isoPos(LOUNGE.gx, LOUNGE.gy);
      const wellColor = this.phase === 'day' ? 0xfff3d0 : this.phase === 'dusk' ? 0xffc9a0 : 0xbcd2ff;
      g.fillStyle(wellColor, 0.07);
      g.fillEllipse(sky.x, sky.y, TILE_W * 7.5, TILE_H * 6.5);
      g.fillStyle(wellColor, 0.08);
      g.fillEllipse(sky.x, sky.y, TILE_W * 4.5, TILE_H * 3.8);
    }

    this.drawStringLights(g);

    // low cutaway walls on the two FRONT edges close the room without hiding
    // the interior. Each bay is its own graphics with depth = its base line,
    // so live street furniture just outside (planters, lamps, scooters)
    // y-sorts IN FRONT of the rail instead of being clipped by it.
    const LOW = 42;
    const fbay = (
      a: { x: number; y: number },
      b: { x: number; y: number },
      face: number,
      high = LOW,
    ): void => {
      const f = this.add.graphics().setDepth(Math.max(a.y, b.y));
      const fq = (h0: number, h1: number, color: number): void => {
        f.fillStyle(color, 1);
        f.fillPoints(
          [
            new Phaser.Geom.Point(a.x, a.y - h1),
            new Phaser.Geom.Point(b.x, b.y - h1),
            new Phaser.Geom.Point(b.x, b.y - h0),
            new Phaser.Geom.Point(a.x, a.y - h0),
          ],
          true,
        );
      };
      fq(0, high, face);
      if (high === LOW) fq(high - 7, high, 0x8a5a2b); // teak cap rail
      fq(0, 8, 0x16302a);
    };
    for (let gy = 0; gy < ROWS; gy++) {
      fbay(isoPos(COLS, gy), isoPos(COLS, gy + 1), 0xe6d5b8);
    }
    // G floor: the front wall opens onto the soi where the walkway crosses —
    // the lot connects to the street like a Sims lot (D3.5). Upper floors
    // keep the full rail.
    const gate = (gx: number): boolean =>
      this.floor === 1 && gx >= ENTRANCE.start && gx < ENTRANCE.start + ENTRANCE.width;
    for (let gx = 0; gx < COLS; gx++) {
      if (gate(gx)) continue;
      fbay(isoPos(gx, ROWS), isoPos(gx + 1, ROWS), 0xf2e6cf);
    }
    if (this.floor === 1) {
      // gate posts flanking the opening
      for (const gp of [ENTRANCE.start, ENTRANCE.start + ENTRANCE.width]) {
        fbay(isoPos(gp - 0.08, ROWS), isoPos(gp + 0.08, ROWS), 0x1e3d34, LOW + 18);
      }
    }
  }

  /** Sagging string-light arcs between the two back walls (ceiling feel). */
  private drawStringLights(g: Phaser.GameObjects.Graphics): void {
    for (const c of [5, 12, 19]) {
      const s = isoPos(0.2, c);
      const e = isoPos(c, 0.2);
      const start = new Phaser.Math.Vector2(s.x, s.y - WALL_H + 14);
      const end = new Phaser.Math.Vector2(e.x, e.y - WALL_H + 14);
      const mid = new Phaser.Math.Vector2(
        (start.x + end.x) / 2,
        Math.max(start.y, end.y) + 56,
      );
      const curve = new Phaser.Curves.QuadraticBezier(start, mid, end);
      const pts = curve.getPoints(26);
      g.lineStyle(2, 0x2c241a, 0.55);
      g.strokePoints(pts, false);
      const glowA = this.phase === 'day' ? 0.12 : 0.3;
      const bulbA = this.phase === 'day' ? 0.55 : 1;
      pts.forEach((p, i) => {
        if (i % 2 === 0) {
          g.fillStyle(0xffd98a, glowA);
          g.fillCircle(p.x, p.y + 3, this.phase === 'day' ? 7 : 9);
          g.fillStyle(0xffe9b0, bulbA);
          g.fillCircle(p.x, p.y + 3, 3);
        }
      });
    }
  }

  /** Rattan pendant lamps over the communal table rows (Seenspace look).
   * The lamp sprite carries its own lit bulb; at dusk/night an additive
   * warm pool spills onto the tables below. */
  private hangRattanLamps(): void {
    if (!this.tex('lamp_rattan')) return;
    const spots: Array<[number, number, number]> = [
      // [gx, gy, hangHeight px] — high enough to clear the table rows
      [5.5, 15.6, 218],
      [8.5, 15.4, 240],
      [11.5, 15.6, 218],
      [17.2, 8.9, 230], // one over the lounge courtyard too
    ];
    const glow = this.add.graphics().setDepth(3);
    glow.setBlendMode(Phaser.BlendModes.ADD);
    for (const [gx, gy, hang] of spots) {
      const c = isoPos(gx, gy);
      const lampY = c.y - hang;
      // cord up into the dark. Depth = the FLOOR point under the lamp, not
      // the hanging height — otherwise shop facades in front rows draw over
      // lamps that hang closer to the camera.
      const cord = this.add.graphics().setDepth(c.y - 1);
      cord.lineStyle(2, 0x1a140c, 0.8);
      cord.lineBetween(c.x, lampY - 130, c.x, lampY);
      const lamp = this.add.image(c.x, lampY, 'lamp_rattan').setOrigin(0.5, 0).setDepth(c.y);
      const w = TILE_W * 0.55;
      lamp.setDisplaySize(w, (w * lamp.height) / lamp.width);
      if (this.phase !== 'day') {
        // warm light pool on the tables + halo around the shade
        glow.fillStyle(0xffb45e, 0.16);
        glow.fillCircle(c.x, lampY + w * 0.6, w * 0.9);
        glow.fillStyle(0xff9d3c, 0.1);
        glow.fillEllipse(c.x, c.y + TILE_H * 0.2, TILE_W * 2.4, TILE_H * 1.9);
        glow.fillStyle(0xffd98a, 0.07);
        glow.fillEllipse(c.x, c.y + TILE_H * 0.2, TILE_W * 3.6, TILE_H * 2.8);
      }
    }
  }

  /** Rooftop garden (floor 3): open sky, low parapet on every edge, dense
   * string lights — no tall walls up here. */
  private drawRooftopShell(): void {
    const f = this.add.graphics().setDepth(8000);
    const back = this.add.graphics().setDepth(1);
    const LOW = 40;
    const quad = (
      g: Phaser.GameObjects.Graphics,
      a: { x: number; y: number },
      b: { x: number; y: number },
      h0: number,
      h1: number,
      color: number,
    ): void => {
      g.fillStyle(color, 1);
      g.fillPoints(
        [
          new Phaser.Geom.Point(a.x, a.y - h1),
          new Phaser.Geom.Point(b.x, b.y - h1),
          new Phaser.Geom.Point(b.x, b.y - h0),
          new Phaser.Geom.Point(a.x, a.y - h0),
        ],
        true,
      );
    };
    const parapet = (
      g: Phaser.GameObjects.Graphics,
      a: { x: number; y: number },
      b: { x: number; y: number },
      face: number,
    ): void => {
      quad(g, a, b, 0, LOW, face);
      quad(g, a, b, LOW - 7, LOW, 0x8a5a2b); // teak cap rail
      quad(g, a, b, 0, 6, 0x16302a);
    };
    // back edges (behind everything) + front edges (closest to camera)
    for (let gx = 0; gx < COLS; gx++) {
      parapet(back, isoPos(gx, 0), isoPos(gx + 1, 0), 0xe6d5b8);
      parapet(f, isoPos(gx, ROWS), isoPos(gx + 1, ROWS), 0xf2e6cf);
    }
    for (let gy = 0; gy < ROWS; gy++) {
      parapet(back, isoPos(0, gy), isoPos(0, gy + 1), 0xf2e6cf);
      parapet(f, isoPos(COLS, gy), isoPos(COLS, gy + 1), 0xe6d5b8);
    }
    // dense festoon lighting — the rooftop signature
    const g = this.add.graphics().setDepth(2);
    this.drawStringLights(g);
    for (const c of [8, 16]) {
      const s = isoPos(c, 0.4);
      const e = isoPos(0.4, c);
      const start = new Phaser.Math.Vector2(s.x, s.y - LOW - 90);
      const end = new Phaser.Math.Vector2(e.x, e.y - LOW - 90);
      const mid = new Phaser.Math.Vector2(
        (start.x + end.x) / 2,
        Math.max(start.y, end.y) + 70,
      );
      const pts = new Phaser.Curves.QuadraticBezier(start, mid, end).getPoints(24);
      g.lineStyle(2, 0x2c241a, 0.55);
      g.strokePoints(pts, false);
      const bulbAlpha = this.phase === 'day' ? 0.35 : 1;
      pts.forEach((p, i) => {
        if (i % 2 === 0) {
          g.fillStyle(0xffd98a, this.phase === 'day' ? 0.1 : 0.3);
          g.fillCircle(p.x, p.y + 3, 8);
          g.fillStyle(0xffe9b0, bulbAlpha);
          g.fillCircle(p.x, p.y + 3, 3);
        }
      });
    }
  }

  /** Screen-space warm dim + vignette so the hall feels enclosed. */
  private drawAmbient(): void {
    const paint = (): void => {
      this.ambientG?.destroy();
      const w = this.scale.width;
      const h = this.scale.height;
      const g = this.add.graphics().setScrollFactor(0).setDepth(9998);
      // kept light on purpose: cozy, not cramped (chill-lounge direction —
      // softened further for the D3.5 open map).
      g.fillStyle(0x1a1006, 0.03);
      g.fillRect(0, 0, w, h);
      if (this.phase === 'night') {
        g.fillStyle(0x0e1c33, this.floor === 3 ? 0.22 : 0.3);
        g.fillRect(0, 0, w, h);
      } else if (this.phase === 'dusk') {
        g.fillStyle(0xcc5a2a, 0.1);
        g.fillRect(0, 0, w, h);
      }
      // faked gradient vignette: two soft bands per edge (near-transparent —
      // a heavy vignette would fight the open-neighbourhood feel)
      const bands: Array<[number, number]> = [
        [14, 0.05],
        [40, 0.02],
      ];
      for (const [t, a] of bands) {
        g.fillStyle(0x120c04, a);
        g.fillRect(0, 0, w, t);
        g.fillRect(0, h - t, w, t);
        g.fillRect(0, 0, t, h);
        g.fillRect(w - t, 0, t, h);
      }
      this.ambientG = g;
    };
    paint();
    this.scale.on('resize', paint);
  }

  /** Warm checkered court under the lounge (Seenspace alley — recoloured
   * from black/white to cream/terracotta per the open-map direction, D3.5). */
  private drawCheckerCourt(): void {
    const g = this.add.graphics().setDepth(0.5);
    for (let gy = 7; gy <= 12; gy++) {
      for (let gx = 15; gx <= 21; gx++) {
        g.fillStyle((gx + gy) % 2 === 0 ? 0xc9825c : 0xefe6d2, 0.92);
        this.fillDiamond(g, gx, gy);
      }
    }
  }

  // ---------- D3.5: Sims-style open neighbourhood ----------
  /** The lot sits in a living soi: sidewalk + road on the two front edges,
   * neighbour shophouses/towers behind the back walls, sky above. Everything
   * static is baked into one RenderTexture (the CANVAS renderer re-draws
   * Graphics paths every frame — ~1k diamonds would tank it live). */
  private drawSurroundings(): void {
    const w = WORLD_W + CAM.side * 2;
    const h = WORLD_H + CAM.top + CAM.bottom;
    const rt = this.add.renderTexture(-CAM.side, -CAM.top, w, h).setOrigin(0).setDepth(0);
    // paint order = distance: sky, far skyline, ground ring, buildings, props
    // (buildings stand ON the alley strip, so they come after the ring).
    // D3.6: everything outside is shifted down by the floor's drop so
    // higher floors genuinely look down on the neighbourhood.
    const sky = this.make.graphics({ x: 0, y: 0 }, false);
    this.paintSky(sky);
    const farDy = FAR_DROP[this.floor] ?? 0;
    this.paintNeighborRow(sky, FAR_NW, 'nw', true, farDy);
    this.paintNeighborRow(sky, FAR_NE, 'ne', true, farDy);
    rt.draw(sky, CAM.side, CAM.top);
    sky.destroy();
    if (this.floor !== 3) this.paintGroundRing(rt);
    this.paintNeighborBlocks(rt);
    if (this.floor === 1) this.paintStreetFurniture(rt);
    if (this.floor === 2) {
      this.paintStreetFurnitureBaked(rt, FLOOR_DROP[2]);
      this.paintOwnFacadeBand(rt, FLOOR_DROP[2]);
    }
    if (this.floor === 3) this.paintRooftopBelow(rt);
    // the painted assets are day-lit; shade the whole neighbourhood after
    // dark so the street reads darker than the lit hall (glows stay live)
    if (this.phase !== 'day') {
      const shade = this.make.graphics({ x: 0, y: 0 }, false);
      shade.fillStyle(
        this.phase === 'night' ? 0x0a1626 : 0xcc5a2a,
        this.phase === 'night' ? 0.32 : 0.1,
      );
      shade.fillRect(-CAM.side, -CAM.top, w, h);
      rt.draw(shade, CAM.side, CAM.top);
      shade.destroy();
    }
    // aerial haze: the higher the floor, the paler the world outside
    if (this.floor > 1 && this.phase !== 'night') {
      const haze = this.make.graphics({ x: 0, y: 0 }, false);
      haze.fillStyle(
        this.phase === 'day' ? 0xcfe0ea : 0xe8c0a0,
        this.floor === 3 ? 0.16 : 0.09,
      );
      haze.fillRect(-CAM.side, -CAM.top, w, h);
      rt.draw(haze, CAM.side, CAM.top);
      haze.destroy();
    }
    if (this.floor === 1) this.drawStreetGlow();
  }

  /** Stamp a generated sprite into the surroundings RT at a grid position
   * (origin bottom-centre). Returns false when the texture is missing so
   * callers can fall back to the procedural version. */
  private rtStamp(
    rt: Phaser.GameObjects.RenderTexture,
    key: string,
    gx: number,
    gy: number,
    widthPx: number,
    flipX = false,
    dy = 0,
  ): boolean {
    if (!this.tex(key)) return false;
    const img = this.make.image({ key, add: false });
    img.setOrigin(0.5, 1);
    img.setDisplaySize(widthPx, (widthPx * img.height) / img.width);
    img.setFlipX(flipX);
    const p = isoPos(gx, gy);
    rt.draw(img, p.x + CAM.side, p.y + CAM.top + dy);
    img.destroy();
    return true;
  }

  /** Ground ring from generated tile materials (asphalt / pavers / grass);
   * falls back to the flat-shaded ring when the textures are missing. */
  private paintGroundRing(rt: Phaser.GameObjects.RenderTexture): void {
    const asphalt = this.makeIsoFloor('floor_asphalt');
    const pavers = this.makeIsoFloor('floor_pavers');
    const grass = this.makeIsoFloor('floor_grass');
    const conc = this.makeIsoFloor('floor_concrete');
    if (!asphalt || !pavers || !grass) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      this.paintStreetRing(g);
      rt.draw(g, CAM.side, CAM.top);
      g.destroy();
      return;
    }
    const dy = FLOOR_DROP[this.floor] ?? 0;
    // distant-ground base under the far corner, past the tile ring (starts
    // well under the ring so no sky can peek through at the corners)
    const base = this.make.graphics({ x: 0, y: 0 }, false);
    if (dy > 0) {
      // upstairs: a shadowed gap opens between the slab edge and the street
      // below — fill it so nothing shows sky through the drop
      const A = isoPos(0, ROWS);
      const B = isoPos(COLS, ROWS);
      const C = isoPos(COLS, 0);
      base.fillStyle(this.phase === 'night' ? 0x11161f : 0x6a7076, 1);
      base.fillPoints(
        [
          new Phaser.Geom.Point(-CAM.side, A.y),
          new Phaser.Geom.Point(A.x, A.y),
          new Phaser.Geom.Point(B.x, B.y),
          new Phaser.Geom.Point(C.x, C.y),
          new Phaser.Geom.Point(WORLD_W + CAM.side, C.y),
          new Phaser.Geom.Point(WORLD_W + CAM.side, WORLD_H + CAM.bottom),
          new Phaser.Geom.Point(-CAM.side, WORLD_H + CAM.bottom),
        ],
        true,
      );
    }
    base.fillStyle(this.phase === 'night' ? 0x3d4a35 : 0x5f7846, 1);
    base.fillRect(
      -CAM.side,
      WORLD_H - TILE_H * 5 + dy,
      WORLD_W + CAM.side * 2,
      CAM.bottom + TILE_H * 6,
    );
    rt.draw(base, CAM.side, CAM.top);
    base.destroy();
    // one reusable stamp per material
    const stamps = new Map<string, Phaser.GameObjects.Image>();
    const stampOf = (k: string): Phaser.GameObjects.Image => {
      let s = stamps.get(k);
      if (!s) {
        s = this.make.image({ key: k, add: false }).setOrigin(0.5);
        stamps.set(k, s);
      }
      return s;
    };
    for (let gy = -EXT; gy < ROWS + EXT; gy++) {
      for (let gx = -EXT; gx < COLS + EXT; gx++) {
        const inside = gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS;
        if (inside) continue;
        let key: string | null;
        if (gx >= COLS || gy >= ROWS) {
          const d = Math.max(gx - COLS, gy - ROWS);
          key = d <= 1 ? pavers : d <= 4 ? asphalt : d === 5 ? pavers : grass;
        } else {
          // narrow service alley behind the building
          key = Math.max(-gx, -gy) > 2 ? null : conc ?? pavers;
        }
        if (!key) continue;
        const c = isoPos(gx + 0.5, gy + 0.5);
        rt.draw(stampOf(key), c.x + CAM.side, c.y + CAM.top + dy);
      }
    }
    stamps.forEach((s) => s.destroy());
    // road markings over the tiles
    const marks = this.make.graphics({ x: 0, y: 0 }, false);
    marks.lineStyle(5, 0xd8b23c, 0.45);
    for (let gx = -6; gx < COLS - 1; gx += 2) {
      const s = isoPos(gx + 0.15, ROWS + 3.5);
      const e = isoPos(gx + 0.85, ROWS + 3.5);
      marks.lineBetween(s.x, s.y + dy, e.x, e.y + dy);
    }
    for (let gy = -6; gy < ROWS - 1; gy += 2) {
      const s = isoPos(COLS + 3.5, gy + 0.15);
      const e = isoPos(COLS + 3.5, gy + 0.85);
      marks.lineBetween(s.x, s.y + dy, e.x, e.y + dy);
    }
    marks.lineStyle(9, 0xe6dfcf, 0.8);
    for (let i = 0; i < 6; i++) {
      const s = isoPos(ENTRANCE.start + 0.35 + i * 0.62, ROWS + 2.15);
      const e = isoPos(ENTRANCE.start + 0.35 + i * 0.62, ROWS + 4.85);
      marks.lineBetween(s.x, s.y + dy, e.x, e.y + dy);
    }
    rt.draw(marks, CAM.side, CAM.top);
    marks.destroy();
  }

  /** Neighbour skyline from the generated backdrop buildings (soi anchor
   * set); procedural extruded blocks when the sprites are missing. */
  private paintNeighborBlocks(rt: Phaser.GameObjects.RenderTexture): void {
    const dy = FLOOR_DROP[this.floor] ?? 0;
    const haveSprites =
      this.tex('backdrop_shophouse_a') &&
      this.tex('backdrop_shophouse_b') &&
      this.tex('backdrop_tower');
    if (!haveSprites) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      this.paintNeighborRow(g, BLOCKS_NW, 'nw', false, dy);
      this.paintNeighborRow(g, BLOCKS_NE, 'ne', false, dy);
      rt.draw(g, CAM.side, CAM.top);
      g.destroy();
      return;
    }
    // shoulder-to-shoulder painted row behind each back wall
    const NE: Array<[string, number, number, boolean]> = [
      ['backdrop_shophouse_a', 0.6, 520, false],
      ['backdrop_shophouse_b', 4.6, 500, true],
      ['backdrop_tower', 8.2, 330, false],
      ['backdrop_shophouse_a', 12.4, 520, true],
      ['backdrop_shophouse_b', 16.6, 500, false],
      ['backdrop_tower', 20.4, 330, true],
      ['backdrop_shophouse_a', 24.6, 520, false],
    ];
    const NW: Array<[string, number, number, boolean]> = [
      ['backdrop_shophouse_b', 1.0, 500, false],
      ['backdrop_tower', 4.9, 330, true],
      ['backdrop_shophouse_a', 8.8, 520, false],
      ['backdrop_shophouse_b', 13.0, 500, true],
      ['backdrop_shophouse_a', 17.2, 520, false],
      ['backdrop_tower', 21.0, 330, false],
      ['backdrop_shophouse_b', 25.2, 500, true],
    ];
    for (const [key, u, w, flip] of NE) this.rtStamp(rt, key, u, -0.85, w, flip, dy);
    for (const [key, u, w, flip] of NW) this.rtStamp(rt, key, -0.85, u, w, flip, dy);
  }

  /** A LIVE street sprite with a floor-anchored depth so it y-sorts against
   * the low front rail (baked stamps sit at depth 0 and get clipped by it).
   * Sprites are day-lit; a phase tint keeps them matching the shaded RT. */
  private streetSprite(key: string, gx: number, gy: number, widthPx: number, flipX = false): void {
    if (!this.tex(key)) return;
    const p = isoPos(gx, gy);
    this.groundShadow(p.x, p.y, widthPx * 0.72, p.y - 1);
    const img = this.add.image(p.x, p.y, key).setOrigin(0.5, 1).setDepth(p.y);
    img.setDisplaySize(widthPx, (widthPx * img.height) / img.width);
    img.setFlipX(flipX);
    if (this.phase === 'night') img.setTint(0x9fa8bc);
    else if (this.phase === 'dusk') img.setTint(0xf2d8c4);
  }

  /** Planter rows, palms, lamps and scooters from the soi set; the flat
   * procedural furniture when the sprites are missing. */
  private paintStreetFurniture(rt: Phaser.GameObjects.RenderTexture): void {
    if (!this.tex('tree_street') || !this.tex('lamp_street')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      this.paintStreetProps(g);
      rt.draw(g, CAM.side, CAM.top);
      g.destroy();
      return;
    }
    // terracotta planter rows hugging the lot walls (reference signature) —
    // skipping the gate opening
    const planterW = TILE_W * 1.7;
    for (let gx = 2.0; gx < COLS - 0.5; gx += 3.4) {
      if (gx > ENTRANCE.start - 1.6 && gx < ENTRANCE.start + ENTRANCE.width + 0.6) continue;
      this.streetSprite('planter_row', gx, ROWS + 0.72, planterW, gx % 6.8 < 3.4);
    }
    for (let gy = 2.0; gy < ROWS - 0.5; gy += 3.4) {
      this.streetSprite('planter_row', COLS + 0.72, gy, planterW, gy % 6.8 < 3.4);
    }
    for (const [gx, gy] of STREET_TREES) {
      this.streetSprite('tree_street', gx, gy, TILE_W * 1.35, (gx + gy) % 2 < 1);
    }
    for (const [gx, gy] of LAMPS) {
      this.streetSprite('lamp_street', gx, gy, TILE_W * 0.55);
    }
    const scooters: Array<[number, number, boolean]> = [
      [6.4, ROWS + 1.7, false],
      [18.3, ROWS + 1.6, true],
      [COLS + 1.7, 11.3, true],
    ];
    for (const [gx, gy, flip] of scooters) {
      this.streetSprite('scooter', gx, gy, TILE_W * 0.95, flip);
    }
  }

  /** Floor 2: the same street furniture, one storey below (baked with the
   * drop — nothing outside needs to interleave with the balcony rail up
   * here). Planter rows hug the G-floor wall, so they're hidden below. */
  private paintStreetFurnitureBaked(rt: Phaser.GameObjects.RenderTexture, dy: number): void {
    for (const [gx, gy] of STREET_TREES) {
      this.rtStamp(rt, 'tree_street', gx, gy, TILE_W * 1.35, (gx + gy) % 2 < 1, dy);
    }
    for (const [gx, gy] of LAMPS) {
      this.rtStamp(rt, 'lamp_street', gx, gy, TILE_W * 0.55, false, dy);
    }
    const scooters: Array<[number, number, boolean]> = [
      [6.4, ROWS + 1.7, false],
      [18.3, ROWS + 1.6, true],
      [COLS + 1.7, 11.3, true],
    ];
    for (const [gx, gy, flip] of scooters) {
      this.rtStamp(rt, 'scooter', gx, gy, TILE_W * 0.95, flip, dy);
    }
  }

  /** Floor 2: our own ground-floor facade drops below the slab edge — the
   * strongest "you are upstairs now" cue. Cream wall, teak sign band,
   * dark shopfront openings, shadow line at the street. */
  private paintOwnFacadeBand(rt: Phaser.GameObjects.RenderTexture, dy: number): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    const deco = (a: { x: number; y: number }, b: { x: number; y: number }): void => {
      const quad = (
        qa: { x: number; y: number },
        qb: { x: number; y: number },
        y0: number,
        y1: number,
        color: number,
        alpha = 1,
      ): void => {
        g.fillStyle(color, alpha);
        g.fillPoints(
          [
            new Phaser.Geom.Point(qa.x, qa.y + y0),
            new Phaser.Geom.Point(qb.x, qb.y + y0),
            new Phaser.Geom.Point(qb.x, qb.y + y1),
            new Phaser.Geom.Point(qa.x, qa.y + y1),
          ],
          true,
        );
      };
      const seg = (u0: number, u1: number, y0: number, y1: number, color: number, alpha = 1): void => {
        const pA = { x: a.x + (b.x - a.x) * u0, y: a.y + (b.y - a.y) * u0 };
        const pB = { x: a.x + (b.x - a.x) * u1, y: a.y + (b.y - a.y) * u1 };
        quad(pA, pB, y0, y1, color, alpha);
      };
      quad(a, b, 0, dy, 0xe9dcc4);
      quad(a, b, 14, 22, 0x8a5a2b); // teak sign band under the slab
      // dark shopfront openings with awning lips along the ground floor
      for (let u = 0.06; u < 0.88; u += 0.16) {
        seg(u - 0.008, u + 0.098, 26, 34, 0x1e3d34);
        seg(u, u + 0.09, 34, dy - 14, 0x243038, 0.92);
      }
      quad(a, b, dy - 8, dy, 0x16302a); // shadow line at the street
    };
    deco(isoPos(0, ROWS), isoPos(COLS, ROWS));
    deco(isoPos(COLS, 0), isoPos(COLS, ROWS));
    rt.draw(g, CAM.side, CAM.top);
    g.destroy();
  }

  /** Floor 3: over the parapet you look DOWN into a shadowed street canyon
   * with neighbour rooflines peeking out — not a same-level street. */
  private paintRooftopBelow(rt: Phaser.GameObjects.RenderTexture): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    const A = isoPos(0, ROWS);
    const B = isoPos(COLS, ROWS);
    const C = isoPos(COLS, 0);
    const canyon =
      this.phase === 'night' ? 0x0d1420 : this.phase === 'dusk' ? 0x4a3a40 : 0x5c6672;
    g.fillStyle(canyon, 1);
    g.fillPoints(
      [
        new Phaser.Geom.Point(-CAM.side, A.y),
        new Phaser.Geom.Point(A.x, A.y),
        new Phaser.Geom.Point(B.x, B.y),
        new Phaser.Geom.Point(C.x, C.y),
        new Phaser.Geom.Point(WORLD_W + CAM.side, C.y),
        new Phaser.Geom.Point(WORLD_W + CAM.side, WORLD_H + CAM.bottom),
        new Phaser.Geom.Point(-CAM.side, WORLD_H + CAM.bottom),
      ],
      true,
    );
    // faint lane markings deep down in the canyon
    g.lineStyle(4, 0xd8b23c, this.phase === 'night' ? 0.06 : 0.1);
    for (let gx = -4; gx < COLS; gx += 2) {
      const s = isoPos(gx + 0.15, ROWS + 3.5);
      const e = isoPos(gx + 0.85, ROWS + 3.5);
      g.lineBetween(s.x, s.y + 260, e.x, e.y + 260);
    }
    rt.draw(g, CAM.side, CAM.top);
    g.destroy();
    // neighbour rooflines peeking above the canyon edge
    const peek = 470;
    const bottoms: Array<[string, number, boolean]> = [
      ['backdrop_shophouse_a', 3, false],
      ['backdrop_shophouse_b', 9.5, true],
      ['backdrop_shophouse_a', 16.5, true],
    ];
    for (const [key, u, flip] of bottoms) {
      this.rtStamp(rt, key, u, ROWS + 1.2, 500, flip, peek);
    }
    const rights: Array<[string, number, boolean]> = [
      ['backdrop_shophouse_b', 4, false],
      ['backdrop_shophouse_a', 11, true],
      ['backdrop_shophouse_b', 18, false],
    ];
    for (const [key, u, flip] of rights) {
      this.rtStamp(rt, key, COLS + 1.2, u, 500, flip, peek);
    }
  }

  /** Soft contact shadow so sprites sit ON the ground instead of floating. */
  private groundShadow(x: number, y: number, w: number, depth: number, alpha = 0.12): void {
    const g = this.add.graphics().setDepth(depth);
    g.fillStyle(0x1a140c, alpha * 0.6);
    g.fillEllipse(x, y - 2, w * 1.3, w * 0.42);
    g.fillStyle(0x1a140c, alpha);
    g.fillEllipse(x, y - 2, w * 0.95, w * 0.3);
  }

  /** Sky dressing above the skyline — bands, clouds / stars / moon by phase. */
  private paintSky(g: Phaser.GameObjects.Graphics): void {
    const L = -CAM.side;
    const R = WORLD_W + CAM.side;
    const T = -CAM.top;
    const puff = (fx: number, y: number, s: number, a: number): void => {
      const x = L + (R - L) * fx;
      g.fillStyle(0xffffff, a);
      g.fillEllipse(x, y, 150 * s, 44 * s);
      g.fillEllipse(x - 55 * s, y + 12 * s, 100 * s, 34 * s);
      g.fillEllipse(x + 60 * s, y + 10 * s, 110 * s, 36 * s);
    };
    if (this.phase === 'day') {
      g.fillStyle(0xbfe0ef, 0.5);
      g.fillRect(L, T, R - L, 130);
      puff(0.12, T + 140, 1.1, 0.5);
      puff(0.36, T + 210, 0.8, 0.4);
      puff(0.58, T + 110, 1.3, 0.5);
      puff(0.82, T + 190, 0.9, 0.45);
      if (this.floor === 3) {
        // low clouds drifting past — you are up in the sky now
        puff(0.22, T + 340, 1.6, 0.4);
        puff(0.72, T + 430, 1.25, 0.34);
      }
    } else if (this.phase === 'dusk') {
      g.fillStyle(0xffb066, 0.3);
      g.fillRect(L, T, R - L, 160);
      g.fillStyle(0xe07a9a, 0.22);
      g.fillRect(L, T + 160, R - L, 120);
      puff(0.3, T + 150, 1.1, 0.14);
      puff(0.7, T + 220, 0.9, 0.12);
    } else {
      g.fillStyle(0x050b16, 0.5);
      g.fillRect(L, T, R - L, 150);
      // deterministic star field (no flicker across scene restarts)
      for (let i = 0; i < 80; i++) {
        const x = L + ((i * 397) % (R - L));
        const y = T + ((i * 211) % 300);
        g.fillStyle(0xdfe9ff, 0.35 + ((i * 53) % 45) / 100);
        g.fillCircle(x, y, i % 3 === 0 ? 2 : 1.3);
      }
      const mx = L + (R - L) * 0.7;
      g.fillStyle(0xf4ecd8, 0.12);
      g.fillCircle(mx, T + 130, 46);
      g.fillStyle(0xf4ecd8, 0.95);
      g.fillCircle(mx, T + 130, 19);
    }
  }

  /** One row of neighbour buildings hugging a back edge. far = hazy backdrop
   * layer (silhouette only); near rows get windows, roofs, tanks, billboard. */
  private paintNeighborRow(
    g: Phaser.GameObjects.Graphics,
    blocks: NeighborBlock[],
    edge: 'ne' | 'nw',
    far: boolean,
    dy = 0,
  ): void {
    // edge 'ne' = the gy=0 wall (blocks extend to gy<0); 'nw' = the gx=0 wall
    const base = (u: number, off: number): { x: number; y: number } =>
      edge === 'ne' ? isoPos(u, -off) : isoPos(-off, u);
    const P = (a: { x: number; y: number }, b: { x: number; y: number }, u: number, hh: number): Phaser.Geom.Point =>
      new Phaser.Geom.Point(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u - hh + dy);
    const quad = (
      a: { x: number; y: number },
      b: { x: number; y: number },
      u0: number,
      u1: number,
      h0: number,
      h1: number,
      color: number,
      alpha = 1,
    ): void => {
      g.fillStyle(color, alpha);
      g.fillPoints([P(a, b, u0, h1), P(a, b, u1, h1), P(a, b, u1, h0), P(a, b, u0, h0)], true);
    };
    const hazeColor =
      this.phase === 'day' ? 0x9fb6c4 : this.phase === 'dusk' ? 0x6a4a5c : 0x141d2e;
    // back-of-roof shift: one tile further from camera along the edge normal
    const shift = edge === 'ne' ? { x: TILE_W / 2, y: -TILE_H / 2 } : { x: -TILE_W / 2, y: -TILE_H / 2 };

    for (let bi = 0; bi < blocks.length; bi++) {
      const blk = blocks[bi];
      const a = base(blk.u0, blk.off);
      const b = base(blk.u1, blk.off);
      if (far) {
        quad(a, b, 0, 1, 0, blk.h, hazeColor, 0.6);
        if (this.phase === 'night') {
          // sparse far-city window lights
          for (let i = 0; i < 14; i++) {
            if ((i * 7 + bi * 5) % 3 === 0) continue;
            const u = 0.08 + ((i * 37) % 84) / 100;
            const hh = 60 + ((i * 61 + bi * 29) % (blk.h - 100));
            const p = P(a, b, u, hh);
            g.fillStyle(0xffd98a, 0.5);
            g.fillRect(p.x, p.y, 3, 5);
          }
        }
        continue;
      }
      const cSide = Phaser.Display.Color.IntegerToColor(blk.c).darken(14).color;
      const cRoof = Phaser.Display.Color.IntegerToColor(blk.c).darken(30).color;
      // facade + slim side return + roof slab
      quad(a, b, 0, 1, 0, blk.h, blk.c);
      const roofA = P(a, b, 0, blk.h);
      const roofB = P(a, b, 1, blk.h);
      g.fillStyle(cRoof, 1);
      g.fillPoints(
        [
          roofA,
          roofB,
          new Phaser.Geom.Point(roofB.x + shift.x, roofB.y + shift.y),
          new Phaser.Geom.Point(roofA.x + shift.x, roofA.y + shift.y),
        ],
        true,
      );
      quad(a, b, 0, 1, blk.h - 8, blk.h, cSide); // parapet lip
      // window grid — lit pattern is deterministic so restarts don't reshuffle
      const cols = blk.tower ? 4 : Math.max(3, Math.round((blk.u1 - blk.u0) * 1.6));
      const du = 0.84 / cols;
      for (let ci = 0; ci < cols; ci++) {
        for (let hy = 46; hy < blk.h - 40; hy += 46) {
          const u0 = 0.08 + ci * du;
          const lit = (ci * 7 + hy / 46 + bi * 3) % 4 < 2;
          let wc = 0xa8c4c9;
          let wa = 0.55;
          if (this.phase === 'night') {
            wc = lit ? 0xffd98a : 0x18222e;
            wa = lit ? 0.92 : 0.85;
          } else if (this.phase === 'dusk') {
            wc = lit ? 0xffc48a : 0x9fb4c0;
            wa = 0.7;
          }
          quad(a, b, u0, u0 + du * 0.55, hy, hy + 26, wc, wa);
        }
      }
      if (blk.tower && this.phase === 'night') {
        const tip = P(a, b, 0.5, blk.h + 6);
        g.fillStyle(0xff4444, 0.9);
        g.fillCircle(tip.x, tip.y, 3.5);
      }
      if (blk.tank) {
        // rooftop water tank — the Bangkok skyline signature
        const t = P(a, b, 0.3, blk.h + 2);
        g.fillStyle(0x8f9ba0, 1);
        g.fillRect(t.x - 14, t.y - 30, 28, 30);
        g.fillStyle(0xa8b4b8, 1);
        g.fillEllipse(t.x, t.y - 30, 28, 10);
      }
    }
    // rooftop billboard (NE near row only) — neon shapes, no lettering
    if (edge === 'ne' && !far) {
      const a = base(BILLBOARD.gx0, -BILLBOARD.gy);
      const b = base(BILLBOARD.gx1, -BILLBOARD.gy);
      quad(a, b, 0.1, 0.9, BILLBOARD.h + 10, BILLBOARD.h + 74, 0x22262b, 0.95);
      const p0 = P(a, b, 0.1, BILLBOARD.h + 42);
      const p1 = P(a, b, 0.9, BILLBOARD.h + 42);
      if (this.phase === 'night' || this.phase === 'dusk') {
        g.lineStyle(3, 0xff5fa8, 0.95);
        g.strokeRoundedRect(
          Math.min(p0.x, p1.x) + 10,
          Math.min(p0.y, p1.y) - 16,
          Math.abs(p1.x - p0.x) - 20,
          34,
          10,
        );
      } else {
        g.fillStyle(0xd8dde0, 0.9);
        g.fillRect(Math.min(p0.x, p1.x) + 10, Math.min(p0.y, p1.y) - 14, Math.abs(p1.x - p0.x) - 20, 30);
      }
    }
  }

  /** Ground ring past the lot: sidewalk → soi (asphalt + dashes + zebra) →
   * kerb → green verge on the front edges; service alley behind the walls. */
  private paintStreetRing(g: Phaser.GameObjects.Graphics): void {
    const road = this.phase === 'night' ? 0x2e2f36 : 0x43454c;
    const side1 = 0xd9d0bd;
    const side2 = 0xcfc5b0;
    const kerb = 0xbfb49c;
    const grass1 = 0x718a52;
    const grass2 = 0x67804b;
    // distant-ground base under the far bottom corner, where the tile ring
    // runs out before the camera margin does
    g.fillStyle(this.phase === 'night' ? 0x3d4a35 : 0x5f7846, 1);
    g.fillRect(-CAM.side, WORLD_H - TILE_H * 5, WORLD_W + CAM.side * 2, CAM.bottom + TILE_H * 6);
    for (let gy = -EXT; gy < ROWS + EXT; gy++) {
      for (let gx = -EXT; gx < COLS + EXT; gx++) {
        const inside = gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS;
        if (inside) continue;
        let color: number;
        if (gx >= COLS || gy >= ROWS) {
          const d = Math.max(gx - COLS, gy - ROWS);
          if (d <= 1) color = (gx + gy) % 2 === 0 ? side1 : side2;
          else if (d <= 4) color = road;
          else if (d === 5) color = kerb;
          else color = (gx * 3 + gy) % 3 === 0 ? grass2 : grass1;
        } else {
          // narrow service alley behind the building; past it the neighbour
          // blocks + sky take over (a deep band would paint over the skyline)
          if (Math.max(-gx, -gy) > 2) continue;
          color = (gx + gy) % 2 === 0 ? 0x8f8878 : 0x958e7d;
        }
        g.fillStyle(color, 0.95);
        this.fillDiamond(g, gx, gy);
      }
    }
    // lane dashes down the middle of each soi
    g.lineStyle(5, 0xd8b23c, 0.45);
    for (let gx = -6; gx < COLS - 1; gx += 2) {
      const s = isoPos(gx + 0.15, ROWS + 3.5);
      const e = isoPos(gx + 0.85, ROWS + 3.5);
      g.lineBetween(s.x, s.y, e.x, e.y);
    }
    for (let gy = -6; gy < ROWS - 1; gy += 2) {
      const s = isoPos(COLS + 3.5, gy + 0.15);
      const e = isoPos(COLS + 3.5, gy + 0.85);
      g.lineBetween(s.x, s.y, e.x, e.y);
    }
    // zebra crossing continuing the gate walkway across the soi
    g.lineStyle(9, 0xe6dfcf, 0.8);
    for (let i = 0; i < 6; i++) {
      const s = isoPos(ENTRANCE.start + 0.35 + i * 0.62, ROWS + 2.15);
      const e = isoPos(ENTRANCE.start + 0.35 + i * 0.62, ROWS + 4.85);
      g.lineBetween(s.x, s.y, e.x, e.y);
    }
  }

  /** Lamp posts, street trees, bushes — baked with the ring. */
  private paintStreetProps(g: Phaser.GameObjects.Graphics): void {
    for (const [gx, gy] of LAMPS) {
      const p = isoPos(gx, gy);
      g.lineStyle(4, 0x2a2a28, 1);
      g.lineBetween(p.x, p.y, p.x, p.y - 92);
      g.fillStyle(0x33322e, 1);
      g.fillCircle(p.x, p.y - 92, 6);
    }
    for (let i = 0; i < STREET_TREES.length; i++) {
      const [gx, gy] = STREET_TREES[i];
      const p = isoPos(gx, gy);
      g.lineStyle(6, 0x4a3a28, 1);
      g.lineBetween(p.x, p.y, p.x, p.y - 46);
      g.fillStyle(0x4c6b3c, 1);
      g.fillEllipse(p.x, p.y - 64, 84, 62);
      g.fillStyle(0x5f8148, 1);
      g.fillEllipse(p.x - 8, p.y - 72, 62, 46);
      g.fillStyle(0x6f935a, 1);
      g.fillEllipse(p.x + 10, p.y - 60, 40, 30);
      // bush at the foot, offset per tree
      g.fillStyle(0x55703f, 1);
      g.fillEllipse(p.x + (i % 2 === 0 ? 46 : -42), p.y + 6, 44, 22);
    }
  }

  /** Live additive layer over the baked street: lamp pools + billboard halo.
   * Kept tiny — the baked RT can't do additive blending. */
  private drawStreetGlow(): void {
    if (this.phase === 'day') return;
    // depth over the front rail: light naturally bleeds over a low wall
    const glow = this.add.graphics().setDepth(8500);
    glow.setBlendMode(Phaser.BlendModes.ADD);
    // the sprite lamp's head hangs off a curved arm up-left of the base;
    // the procedural fallback pole holds it straight up. Head offset comes
    // from the actual texture ratio (the post-processed crop varies).
    const lw = TILE_W * 0.55;
    const spriteLamp = this.tex('lamp_street');
    let headDx = 0;
    let headDy = -92;
    if (spriteLamp) {
      const src = this.textures.get('lamp_street').getSourceImage();
      const lh = lw * (src.height / src.width);
      headDx = -lw * 0.28;
      headDy = -lh * 0.85;
    }
    for (const [gx, gy] of LAMPS) {
      const p = isoPos(gx, gy);
      glow.fillStyle(0xffc978, 0.3);
      glow.fillCircle(p.x + headDx, p.y + headDy, 22);
      glow.fillStyle(0xffb45e, 0.1);
      glow.fillEllipse(p.x + headDx, p.y + 4, 150, 62);
    }
    const a = isoPos(BILLBOARD.gx0, BILLBOARD.gy);
    const b = isoPos(BILLBOARD.gx1, BILLBOARD.gy);
    glow.fillStyle(0xff5fa8, 0.12);
    glow.fillEllipse((a.x + b.x) / 2, (a.y + b.y) / 2 - BILLBOARD.h - 42, Math.abs(b.x - a.x), 80);
  }

  private fillDiamond(g: Phaser.GameObjects.Graphics, gx: number, gy: number): void {
    const t = isoPos(gx, gy);
    const r = isoPos(gx + 1, gy);
    const b = isoPos(gx + 1, gy + 1);
    const l = isoPos(gx, gy + 1);
    g.fillPoints(
      [new Phaser.Geom.Point(t.x, t.y), new Phaser.Geom.Point(r.x, r.y), new Phaser.Geom.Point(b.x, b.y), new Phaser.Geom.Point(l.x, l.y)],
      true,
    );
  }

  // ---------- decor ----------
  private placeProp(key: string, gx: number, gy: number, widthPx: number): void {
    if (!this.tex(key)) return;
    const p = isoPos(gx, gy);
    const y = p.y + TILE_H * 0.35;
    this.groundShadow(p.x, y, widthPx * 0.72, y - 1);
    const img = this.add.image(p.x, y, key).setOrigin(0.5, 1).setDepth(y);
    img.setDisplaySize(widthPx, (widthPx * img.height) / img.width);
  }

  private drawDecor(): void {
    if (this.floor === 2) {
      // boutique level: quiet corridor of planters
      const plants2: Array<[number, number, string]> = [
        [3.4, 6.6, 'plant_monstera'],
        [8.4, 6.6, 'plant_fern'],
        [15.4, 6.6, 'plant_banana'],
        [20.4, 6.6, 'plant_monstera'],
        [6.5, 18.5, 'plant_fern'],
        [17.5, 18.5, 'plant_banana'],
      ];
      plants2.forEach(([gx, gy, key]) => this.placeProp(key, gx, gy, TILE_W * 0.62));
      return;
    }
    if (this.floor === 3) {
      // rooftop garden: lounge under the sky + lots of green
      if (this.tex('rug')) {
        const r = isoPos(10.5, 10.8);
        const rug = this.add.image(r.x, r.y, 'rug').setOrigin(0.5).setDepth(1.5);
        rug.setDisplaySize(TILE_W * 3.4, (TILE_W * 3.4 * rug.height) / rug.width);
      }
      this.placeProp('sofa', 10.5, 10.5, TILE_W * 2.1);
      const garden: Array<[number, number, string]> = [
        [4.5, 4.5, 'plant_banana'],
        [7.5, 3.5, 'plant_monstera'],
        [12.5, 4.5, 'plant_fern'],
        [17.5, 5.5, 'plant_banana'],
        [20.5, 8.5, 'plant_monstera'],
        [4.5, 12.5, 'plant_fern'],
        [6.5, 17.5, 'plant_banana'],
        [12.5, 19.5, 'plant_monstera'],
        [18.5, 16.5, 'plant_fern'],
        [20.5, 19.5, 'plant_banana'],
      ];
      garden.forEach(([gx, gy, key]) => this.placeProp(key, gx, gy, TILE_W * 0.62));
      return;
    }
    this.placeProp('counter_bar', 15.6, 16.2, TILE_W * 2.9);
    // Seenspace touches: big interior trees breaking up the hall…
    const trees: Array<[number, number]> = [
      [3.2, 13.2],
      [14.8, 12.6],
      [21.3, 13.4],
    ];
    trees.forEach(([gx, gy]) => this.placeProp('tree_interior', gx, gy, TILE_W * 1.15));
    // …and a cluster of rattan pendants glowing over the communal rows
    this.hangRattanLamps();
    // lounge courtyard: flat rug hugs the floor, sofa group on top
    if (this.tex('rug')) {
      const r = isoPos(LOUNGE.gx, LOUNGE.gy + 0.3);
      const rug = this.add.image(r.x, r.y, 'rug').setOrigin(0.5).setDepth(1.5);
      rug.setDisplaySize(TILE_W * 3.4, (TILE_W * 3.4 * rug.height) / rug.width);
    }
    this.placeProp('sofa', LOUNGE.gx, LOUNGE.gy, TILE_W * 2.1);
    this.placeProp('gacha', GACHA.gx + 0.5, GACHA.gy + 0.5, TILE_W * 0.75);
    if (this.tex('gacha')) {
      const c = isoPos(GACHA.gx + 0.5, GACHA.gy + 0.5);
      this.add
        .text(c.x, c.y + TILE_H * 0.55, '🎰 gachapon', {
          color: '#ffffff',
          fontSize: '12px',
          backgroundColor: '#00000099',
          padding: { x: 4, y: 1 },
        })
        .setOrigin(0.5, 0)
        .setDepth(9000);
    }
    this.placeProp('cabinet', CABINET.gx + 0.5, CABINET.gy + 0.5, TILE_W * 0.9);
    if (this.tex('cabinet')) {
      const c = isoPos(CABINET.gx + 0.5, CABINET.gy + 0.5);
      this.add
        .text(c.x, c.y + TILE_H * 0.55, '🪙 coasters', {
          color: '#ffffff',
          fontSize: '12px',
          backgroundColor: '#00000099',
          padding: { x: 4, y: 1 },
        })
        .setOrigin(0.5, 0)
        .setDepth(9000);
    }
    const plants: Array<[number, number, string]> = [
      [1.4, 1.6, 'plant_monstera'],
      [13.4, 1.8, 'plant_banana'],
      [20.6, 2.4, 'plant_fern'],
      [1.6, 11.6, 'plant_banana'],
      [21.4, 12.0, 'plant_monstera'],
      [4.6, 19.6, 'plant_fern'],
      [18.6, 20.0, 'plant_banana'],
      [11.6, 21.6, 'plant_monstera'],
    ];
    plants.forEach(([gx, gy, key]) => this.placeProp(key, gx, gy, TILE_W * 0.62));
  }

  private makeActor(color: number, name: string): Phaser.GameObjects.Container {
    const shadow = this.add.ellipse(0, 19, 36, 13, 0x1a140c, 0.18);
    const body = this.add.rectangle(0, 0, 26, 34, color).setStrokeStyle(2, 0x0b1a22);
    const label = this.add.text(0, -30, name, { color: '#eaf6ff', fontSize: '12px' }).setOrigin(0.5);
    return this.add.container(0, 0, [shadow, body, label]);
  }

  private createAvatar(): void {
    this.avatar = this.makeActor(0x7fd6ff, this.me.display_name);
    const p = isoPos(this.pos.gx, this.pos.gy);
    this.avatar.setPosition(p.x, p.y).setDepth(p.y);
  }

  // ---------- HUD ----------
  private createHud(): void {
    this.hud = this.add
      .text(12, 10, '', { color: '#eaf6ff', fontSize: '14px', backgroundColor: '#000000aa', padding: { x: 8, y: 6 } })
      .setScrollFactor(0)
      .setDepth(10000);
    this.hint = this.add
      .text(12, this.scale.height - 58, '', {
        color: '#ffe9a8',
        fontSize: '14px',
        backgroundColor: '#000000aa',
        padding: { x: 8, y: 6 },
      })
      .setScrollFactor(0)
      .setDepth(10000);
    this.toastText = this.add
      .text(this.scale.width / 2, 60, '', { color: '#ffffff', fontSize: '16px', padding: { x: 12, y: 8 } })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(10000)
      .setAlpha(0);
    this.updateHud();
    this.scale.on('resize', () => {
      this.hint.setY(this.scale.height - 58);
      this.toastText.setX(this.scale.width / 2);
    });
  }

  private updateHud(): void {
    const mode = this.offline ? '  ·  OFFLINE PREVIEW' : '';
    this.hud.setText(
      `${this.me.display_name}   💰 ${this.coins}   🏢 ${FLOOR_NAMES[this.floor]}${mode}\nWASD/Arrows move · click plot to rent · [E] interact · [Q] quests`,
    );
  }

  private toast(msg: string, color = 0x22bb77): void {
    this.toastText
      .setText(msg)
      .setBackgroundColor('#' + color.toString(16).padStart(6, '0'))
      .setAlpha(1);
    this.tweens.killTweensOf(this.toastText);
    this.time.delayedCall(2600, () =>
      this.tweens.add({ targets: this.toastText, alpha: 0, duration: 500 }),
    );
  }

  // ---------- input ----------
  private setupInput(): void {
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keys = kb.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown-E', () => void this.onInteract());
    kb.on('keydown-Q', () => this.toggleQuestPanel());
    kb.on('keydown-C', () => void this.onCheers());
    kb.on('keydown-T', () => void this.onTalkNpc());
    kb.on('keydown-ESC', () => {
      this.exitPhotoMode();
      this.closeCoasterPanel();
      this.closeFloorPanel();
    });
    kb.on('keydown-SPACE', () => void this.onCapturePhoto());
    for (let n = 1; n <= 4; n++) {
      kb.on(`keydown-${'ONE TWO THREE FOUR'.split(' ')[n - 1]}`, () => void this.onDigit(n));
    }
  }

  private async onDigit(n: number): Promise<void> {
    if (this.floorPanel) {
      if (n <= 3) this.switchFloor(n);
      return;
    }
    if (this.photoMode) {
      if (n <= PHOTO_BACKDROPS.length) {
        this.photoBackdropIdx = n - 1;
        this.photoBackdrop?.setFillStyle(PHOTO_BACKDROPS[this.photoBackdropIdx].color);
      }
      return;
    }
    if (this.vendingPanel && this.nearMachineId) {
      await this.onBuyVending(n - 1);
    }
  }

  // ---------- plots ----------
  private async loadPlots(): Promise<void> {
    try {
      const plots = await api.plots();
      plots.filter((p) => p.floor === this.floor).forEach((p) => this.drawPlot(p));
    } catch {
      this.toast('Failed to load plots', 0xcc4444);
    }
  }

  private plotCorners(p: Plot): { t: { x: number; y: number }; r: { x: number; y: number }; b: { x: number; y: number }; l: { x: number; y: number } } {
    return {
      t: isoPos(p.grid_x, p.grid_y),
      r: isoPos(p.grid_x + p.width_tiles, p.grid_y),
      b: isoPos(p.grid_x + p.width_tiles, p.grid_y + p.height_tiles),
      l: isoPos(p.grid_x, p.grid_y + p.height_tiles),
    };
  }

  private drawPlot(p: Plot): void {
    // plot tiles are impassable for the AutoServeBot's A* (walks around shops)
    for (let gy = p.grid_y; gy < p.grid_y + p.height_tiles; gy++) {
      for (let gx = p.grid_x; gx < p.grid_x + p.width_tiles; gx++) {
        this.blockedTiles.add(gy * COLS + gx);
      }
    }

    this.drawShopShell(p);

    // plot floor: teak when rented, concrete when vacant
    this.blitPlotFloor(p);

    // status outline (diamond)
    const outline = this.add.graphics().setDepth(2);
    this.strokePlot(outline, p);

    // interactive diamond zone
    const { t, r, b, l } = this.plotCorners(p);
    const minX = l.x;
    const minY = t.y;
    const zone = this.add
      .zone(minX, minY, r.x - l.x, b.y - t.y)
      .setOrigin(0)
      .setInteractive({
        hitArea: new Phaser.Geom.Polygon([
          t.x - minX, t.y - minY,
          r.x - minX, r.y - minY,
          b.x - minX, b.y - minY,
          l.x - minX, l.y - minY,
        ]),
        hitAreaCallback: Phaser.Geom.Polygon.Contains,
        useHandCursor: true,
      });

    // facade anchored just above the plot's bottom corner
    let facade: Phaser.GameObjects.Image | undefined;
    const fk = facadeKey(p.facade_template, p.status === 'VACANT');
    if (this.tex(fk)) {
      const cx = (l.x + r.x) / 2;
      const anchorY = b.y - TILE_H * 0.55;
      // fill the 4-tile unit so adjacent shops read continuous
      const w = TILE_W * 3.4;
      // contact shadow seats the unit on the hall floor (no floating slab)
      this.groundShadow(cx, anchorY + 6, w * 0.8, anchorY - 1, 0.15);
      facade = this.add.image(cx, anchorY, fk).setOrigin(0.5, 1).setDepth(anchorY);
      facade.setDisplaySize(w, (w * facade.height) / facade.width);
      if (this.phase !== 'day' && p.status === 'RENTED') {
        this.drawShopNeon(cx, anchorY - facade.displayHeight, anchorY, w, p);
      }
    }

    const label = this.add
      .text(t.x, t.y + TILE_H * 0.2, this.plotLabel(p), {
        color: '#ffffff',
        fontSize: '13px',
        backgroundColor: '#00000099',
        padding: { x: 5, y: 2 },
      })
      .setOrigin(0.5, 0)
      .setDepth(9000);
    zone.on('pointerdown', () => void this.onRentPlot(p.id));
    this.plotViews.push({ plot: p, outline, zone, facade, label });
  }

  /** Party walls so adjacent units read wall-to-wall like a real mall.
   * Units against the top wall get side walls running into the hall; units
   * on the left wall get side walls running right. The storefront stays
   * open (walls cover the back 2.5 tiles of the unit's depth). */
  private drawShopShell(p: Plot): void {
    const H = 120;
    const seg = (
      a: { x: number; y: number },
      b: { x: number; y: number },
      face: number,
    ): void => {
      const g = this.add.graphics().setDepth(Math.max(a.y, b.y) - 1);
      const q = (h0: number, h1: number, color: number): void => {
        g.fillStyle(color, 1);
        g.fillPoints(
          [
            new Phaser.Geom.Point(a.x, a.y - h1),
            new Phaser.Geom.Point(b.x, b.y - h1),
            new Phaser.Geom.Point(b.x, b.y - h0),
            new Phaser.Geom.Point(a.x, a.y - h0),
          ],
          true,
        );
      };
      q(0, H, face);
      q(0, 10, 0x8a5a2b); // teak base
      q(H - 6, H, 0x1e3d34); // green trim
    };
    const depth = 2.5;
    if (p.grid_y <= 1) {
      for (const gx of [p.grid_x, p.grid_x + p.width_tiles]) {
        seg(isoPos(gx, p.grid_y), isoPos(gx, p.grid_y + depth), 0xf2e6cf);
      }
    } else if (p.grid_x <= 1) {
      for (const gy of [p.grid_y, p.grid_y + p.height_tiles]) {
        seg(isoPos(p.grid_x, gy), isoPos(p.grid_x + depth, gy), 0xe6d5b8);
      }
    }
  }

  /** After dark, open shops get a neon accent above the sign and a warm
   * spill on the walkway (additive, shapes only — no lettering, per the
   * locked art rules). Colours rotate per shop like a real mall strip. */
  private drawShopNeon(cx: number, topY: number, baseY: number, w: number, p: Plot): void {
    const palette = [0xff5fa8, 0x5fc8ff, 0x69e0c3, 0xffb84d];
    const color = palette[(p.code.charCodeAt(p.code.length - 1) || 0) % palette.length];
    const g = this.add.graphics().setDepth(baseY + 1);
    g.setBlendMode(Phaser.BlendModes.ADD);
    // neon tube: rounded outline + soft halo
    const nw = w * 0.34;
    const nh = 16;
    const nx = cx - nw / 2;
    const ny = topY + 6;
    g.lineStyle(6, color, 0.2);
    g.strokeRoundedRect(nx - 3, ny - 3, nw + 6, nh + 6, 9);
    g.lineStyle(2.5, color, 0.95);
    g.strokeRoundedRect(nx, ny, nw, nh, 7);
    // warm spill from the storefront onto the walkway
    g.fillStyle(0xffa04d, 0.09);
    g.fillEllipse(cx, baseY + TILE_H * 0.45, w * 0.95, TILE_H * 2.2);
  }

  private blitPlotFloor(p: Plot): void {
    const key = this.makeIsoFloor(p.status === 'RENTED' ? 'floor_teak' : 'floor_concrete');
    if (key) this.blitFloor(key, p.grid_x, p.grid_y, p.width_tiles, p.height_tiles);
  }

  private strokePlot(g: Phaser.GameObjects.Graphics, p: Plot): void {
    const { t, r, b, l } = this.plotCorners(p);
    g.clear();
    g.lineStyle(3, this.plotColor(p), 0.95);
    g.strokePoints(
      [new Phaser.Geom.Point(t.x, t.y), new Phaser.Geom.Point(r.x, r.y), new Phaser.Geom.Point(b.x, b.y), new Phaser.Geom.Point(l.x, l.y)],
      true,
      true,
    );
  }

  private plotColor(p: Plot): number {
    if (p.is_mine) return 0x2ea36a;
    if (p.status === 'RENTED') return 0x8a5a2b;
    return 0x3a86a8;
  }

  private plotLabel(p: Plot): string {
    const who = p.is_mine ? 'YOU' : (p.owner_name ?? 'vacant');
    return `${p.code} · ${p.status === 'VACANT' ? `rent ${p.rent_price}` : who}`;
  }

  private refreshPlot(view: PlotView): void {
    const p = view.plot;
    this.blitPlotFloor(p);
    this.strokePlot(view.outline, p);
    view.label.setText(this.plotLabel(p));
    const fk = facadeKey(p.facade_template, p.status === 'VACANT');
    if (view.facade && this.tex(fk)) view.facade.setTexture(fk);
  }

  private async onRentPlot(plotId: string): Promise<void> {
    if (this.busy) return;
    if (this.offline) {
      this.toast('Offline preview — renting needs the API', 0xcc8844);
      return;
    }
    const view = this.plotViews.find((v) => v.plot.id === plotId);
    if (!view) return;
    const p = view.plot;
    if (p.status !== 'VACANT') {
      this.toast(p.is_mine ? 'This is your plot' : 'Already rented', 0xcc8844);
      return;
    }
    if (this.coins < p.rent_price) {
      this.toast('Not enough coins', 0xcc4444);
      return;
    }
    this.busy = true;
    try {
      const updated = await api.rent(p.id);
      this.coins -= p.rent_price;
      view.plot = updated;
      this.refreshPlot(view);
      this.updateHud();
      this.toast(`Rented ${updated.code}! (-${p.rent_price})`);
    } catch (err) {
      this.toast((err as Error).message, 0xcc4444);
    } finally {
      this.busy = false;
    }
  }

  // ---------- realtime ----------
  private connectSocket(): void {
    this.ws = connectWorld(this.token, (msg) => this.onServer(msg));
  }

  private onServer(msg: ServerMessage): void {
    switch (msg.type) {
      case 'snapshot':
        msg.tables.filter((t) => t.floor === this.floor).forEach((t) => this.upsertTable(t));
        msg.players.forEach((p) => {
          if (p.id !== this.me.id) this.upsertOther(p);
        });
        break;
      case 'player_joined':
      case 'player_moved':
        if (msg.player.id !== this.me.id) this.upsertOther(msg.player);
        break;
      case 'player_left':
        this.removeOther(msg.id);
        break;
      case 'table_updated':
        if (msg.table.floor === this.floor) {
          this.upsertTable(msg.table);
          this.onTableForBot(msg.table);
        }
        break;
      case 'job_level_up':
        this.toast(`🎉 ${msg.job_type} reached Lv.${msg.level}!`, 0x2ea36a);
        break;
      case 'quest_completed':
        this.toast(`Quest complete: ${msg.title} — claim on the dashboard`, 0x2ea36a);
        void this.loadQuests();
        break;
      case 'order_alert':
        this.toast(`🛎 New order at ${msg.table_code} (your shift)`, 0xc9a227);
        break;
      case 'staff_hired':
        this.toast('You got the job! 🎉', 0x2ea36a);
        break;
      case 'tip_received':
        this.coins += msg.amount;
        this.updateHud();
        this.toast(`💝 Tip received: +${msg.amount}`, 0x2ea36a);
        break;
      case 'wage_paid':
        this.coins += msg.amount;
        this.updateHud();
        this.toast(`💼 Wage +${msg.amount} (${msg.table_code})`, 0x2ea36a);
        break;
      case 'vending_updated':
        this.applyVendingStock(msg.machine_id, msg.slot_id, msg.stock);
        break;
      case 'vending_low_stock':
        this.toast(`⚠ ${msg.item_name} almost out of stock (${msg.stock} left)`, 0xcc8844);
        break;
      case 'coaster_granted':
        this.toast(
          msg.tier === 'OPENING_NIGHT'
            ? `🥇 Opening-night coaster from ${msg.shop_code}!`
            : msg.tier === 'REGULAR'
              ? `⭐ Regular coaster earned at ${msg.shop_code}!`
              : `🪙 Coaster collected: ${msg.shop_code}`,
          0x2ea36a,
        );
        break;
      case 'cheers':
        this.toast(`🍻 ${msg.from_name} cheers with you! (${msg.total}×)`, 0x2ea36a);
        break;
      case 'coaster_sold':
        this.toast(`🪙 Your coaster sold for ${msg.price}c!`, 0x2ea36a);
        break;
      case 'bartender_story':
        this.toast(`📖 "${msg.title}" — new story in your album!`, 0x2f6f6a);
        break;
      case 'heart_level_up':
        this.toast(`💛 Heart level ${msg.level}!`, 0xd08bb0);
        void this.loadNpcs();
        break;
      case 'heart_story':
        this.toast(`💛 ${msg.staff_name}: "${msg.title}" unlocked`, 0xd08bb0);
        break;
      case 'regular_achieved':
        this.toast(`⭐ You are now a regular at ${msg.shop_code} (${msg.menu_name})!`, 0xc9a227);
        break;
    }
  }

  private upsertOther(p: PlayerState): void {
    // players on other floors are simply not here
    if ((p.floor || 1) !== this.floor) {
      this.removeOther(p.id);
      return;
    }
    let o = this.others.get(p.id);
    if (!o) {
      o = { c: this.makeActor(0xffd27f, p.display_name), gx: p.x, gy: p.y };
      this.others.set(p.id, o);
    }
    o.gx = p.x;
    o.gy = p.y;
    const s = isoPos(p.x, p.y);
    o.c.setPosition(s.x, s.y).setDepth(s.y);
  }

  private removeOther(id: string): void {
    const o = this.others.get(id);
    if (o) {
      o.c.destroy();
      this.others.delete(id);
    }
  }

  // ---------- tables ----------
  private upsertTable(t: TableView): void {
    const c = isoPos(t.grid_x + 0.5, t.grid_y + 0.5);
    const anchorY = c.y + TILE_H * 0.35;
    let v = this.tableViews.get(t.id);
    if (!v) {
      let sprite: Phaser.GameObjects.Image | undefined;
      let fallback: Phaser.GameObjects.Rectangle | undefined;
      // Seenspace look: long communal tables in the G-floor beer garden,
      // round cafe tables elsewhere (rooftop keeps the cozy round ones)
      const key =
        this.floor === 1 && this.tex('table_communal') ? 'table_communal' : 'table_round';
      if (this.tex(key)) {
        const w = key === 'table_communal' ? TILE_W * 1.55 : TILE_W * 0.95;
        this.groundShadow(c.x, anchorY, w * 0.85, anchorY - 1);
        sprite = this.add.image(c.x, anchorY, key).setOrigin(0.5, 1).setDepth(anchorY);
        sprite.setDisplaySize(w, (w * sprite.height) / sprite.width);
      } else {
        fallback = this.add
          .rectangle(c.x, c.y, TILE_W * 0.5, TILE_H * 0.8, 0x445c6b, 0.9)
          .setOrigin(0.5, 1)
          .setStrokeStyle(2, 0x0b1a22)
          .setDepth(anchorY);
      }
      const spriteTop = anchorY - (sprite?.displayHeight ?? TILE_H);
      const badge = this.add
        .circle(c.x + TILE_W * 0.34, spriteTop + 8, 7, this.tableColor(t.state))
        .setStrokeStyle(2, 0x0b1a22)
        .setDepth(9000);
      const label = this.add
        .text(c.x, spriteTop - 12, '', {
          color: '#ffffff',
          fontSize: '12px',
          backgroundColor: '#00000099',
          padding: { x: 4, y: 1 },
        })
        .setOrigin(0.5)
        .setDepth(9000);
      v = { table: t, sprite, fallback, badge, label };
      this.tableViews.set(t.id, v);
    }
    v.table = t;
    v.badge.setFillStyle(this.tableColor(t.state));
    v.fallback?.setFillStyle(this.tableColor(t.state), 0.9);
    v.label.setText(`${t.code} ${this.tableStateText(t.state)}`);
  }

  private tableColor(s: TableView['state']): number {
    if (s === 'EMPTY') return 0x9db4c4;
    if (s === 'ORDERED') return 0xc9a227;
    if (s === 'SERVED') return 0x2ea36a;
    return 0x9b6dff;
  }

  private tableStateText(s: TableView['state']): string {
    if (s === 'EMPTY') return '·';
    if (s === 'ORDERED') return '⏳';
    if (s === 'SERVED') return '🍽️';
    return '✔';
  }

  // ---------- actions ----------
  private async onInteract(): Promise<void> {
    if (this.photoMode) return; // SPACE captures, ESC exits
    if (this.floorPanel) {
      this.closeFloorPanel();
      return;
    }
    if (this.nearLift) {
      this.openFloorPanel();
      return;
    }
    if (this.coasterPanel) {
      this.closeCoasterPanel();
      return;
    }
    if (this.nearCabinet) {
      await this.openCoasterPanel();
      return;
    }
    if (this.nearGacha) {
      await this.onSpinGacha();
      return;
    }
    if (this.nearBooth) {
      this.enterPhotoMode();
      return;
    }
    if (this.nearMachineId) {
      this.toggleVendingPanel();
      return;
    }
    await this.onInteractTable();
  }

  // ---------- Phase 2 §6: StaffNPC presence ----------
  /** Position behind the bar counter where the on-shift character stands. */
  private static readonly NPC_SPOT = { gx: 14.6, gy: 15.4 };

  private async loadNpcs(): Promise<void> {
    try {
      this.npcs = await api.npcs();
    } catch {
      this.npcs = [];
    }
    const onShift = this.npcs.find((n) => n.on_shift);
    this.npcActor?.destroy();
    this.npcActor = undefined;
    if (!onShift) return;
    // distinct look + explicit NPC badge — never confusable with players
    const body = this.add.rectangle(0, 0, 26, 34, 0xd08bb0).setStrokeStyle(2, 0x0b1a22);
    const apron = this.add.rectangle(0, 8, 20, 14, 0x1e3d34).setStrokeStyle(1, 0x0b1a22);
    const label = this.add
      .text(0, -32, `${onShift.name} · NPC ☆`, {
        color: '#ffd1e8',
        fontSize: '11px',
        backgroundColor: '#00000066',
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5);
    this.npcActor = this.add.container(0, 0, [body, apron, label]);
    const p = isoPos(WorldScene.NPC_SPOT.gx, WorldScene.NPC_SPOT.gy);
    this.npcActor.setPosition(p.x, p.y).setDepth(p.y);
  }

  private async onTalkNpc(): Promise<void> {
    if (this.busy || !this.nearNpcId) return;
    if (this.offline) {
      this.toast('Offline preview — talking needs the API', 0xcc8844);
      return;
    }
    this.busy = true;
    try {
      const res = await api.talkNpc(this.nearNpcId);
      this.toast(`💬 ${res.line}`, 0x2f6f6a);
    } catch (err) {
      this.toast((err as Error).message, 0xcc8844);
    } finally {
      this.busy = false;
    }
  }

  // ---------- Phase 2 §5: gachapon ----------
  private async onSpinGacha(): Promise<void> {
    if (this.busy) return;
    if (this.offline) {
      this.toast('Offline preview — gacha needs the API', 0xcc8844);
      return;
    }
    this.busy = true;
    try {
      const res = await api.spinGacha();
      this.coins = res.balance;
      this.updateHud();
      this.playGachaDrop();
      this.toast(
        res.granted
          ? `🎉 Capsule! ${res.shop_code} seasonal coaster!`
          : `Capsule… duplicate — +${res.refund}c back`,
        res.granted ? 0x2ea36a : 0x8a5a2b,
      );
    } catch (err) {
      this.toast((err as Error).message, 0xcc4444);
    } finally {
      this.busy = false;
    }
  }

  private playGachaDrop(): void {
    const c = isoPos(GACHA.gx + 0.5, GACHA.gy + 0.5);
    const ball = this.add
      .text(c.x, c.y + TILE_H * 0.35 - 70, '🔮', { fontSize: '20px' })
      .setOrigin(0.5)
      .setDepth(9500);
    this.tweens.add({
      targets: ball,
      y: c.y + TILE_H * 0.3,
      duration: 380,
      ease: 'Bounce.easeOut',
      onComplete: () =>
        this.tweens.add({
          targets: ball,
          alpha: 0,
          delay: 420,
          duration: 320,
          onComplete: () => ball.destroy(),
        }),
    });
  }

  // ---------- Phase 2: cheers (server verifies presence) ----------
  private async onCheers(): Promise<void> {
    if (this.busy || !this.nearPlayerId || this.photoMode) return;
    if (this.offline) {
      this.toast('Offline preview — cheers needs the API', 0xcc8844);
      return;
    }
    this.busy = true;
    try {
      const res = await api.cheers(this.nearPlayerId);
      this.toast(`🍻 Cheers! (${res.total}× together)`, 0x2ea36a);
    } catch (err) {
      this.toast((err as Error).message, 0xcc4444);
    } finally {
      this.busy = false;
    }
  }

  // ---------- Phase 2: display cabinet (coaster gallery) ----------
  private closeCoasterPanel(): void {
    this.coasterPanel?.destroy();
    this.coasterPanel = undefined;
  }

  private async openCoasterPanel(): Promise<void> {
    this.closeCoasterPanel();
    let coasters: Awaited<ReturnType<typeof api.myCoasters>> = [];
    if (!this.offline) {
      coasters = await api.myCoasters().catch(() => []);
    }
    const w = 340;
    const cols = 4;
    const cell = 72;
    const rows = Math.max(1, Math.ceil(coasters.length / cols));
    const h = 64 + rows * (cell + 18);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.18);
    g.fillRoundedRect(4, 6, w, h, 14);
    g.fillStyle(0xf5ead7, 0.97);
    g.lineStyle(3, 0x1e3d34, 1);
    g.fillRoundedRect(0, 0, w, h, 14);
    g.strokeRoundedRect(0, 0, w, h, 14);
    const parts: Phaser.GameObjects.GameObject[] = [g];
    parts.push(
      this.add.text(14, 10, `Coaster collection (${coasters.length}) · [E] close`, {
        color: '#1e3d34',
        fontSize: '14px',
        fontStyle: 'bold',
      }),
    );
    if (coasters.length === 0) {
      parts.push(
        this.add.text(14, 40, this.offline ? 'offline preview' : 'order at a shop table to collect its coaster', {
          color: '#8a5a2b',
          fontSize: '12px',
        }),
      );
    }
    coasters.slice(0, 12).forEach((c, i) => {
      const x = 22 + (i % cols) * (cell + 12);
      const y = 42 + Math.floor(i / cols) * (cell + 18);
      const key = c.tier === 'OPENING_NIGHT' ? 'coaster_opening' : 'coaster_blank';
      if (this.tex(key)) {
        const img = this.add.image(x + cell / 2, y + cell / 2, key);
        img.setDisplaySize(cell, cell);
        parts.push(img);
      }
      parts.push(
        this.add
          .text(x + cell / 2, y + cell + 2, `${c.shop_code ?? '?'}${c.tier === 'OPENING_NIGHT' ? ' 🥇' : ''}`, {
            color: '#41372a',
            fontSize: '10px',
          })
          .setOrigin(0.5, 0),
      );
    });
    this.coasterPanel = this.add
      .container(this.scale.width / 2 - w / 2, this.scale.height / 2 - h / 2, parts)
      .setScrollFactor(0)
      .setDepth(10001);
  }

  private async onInteractTable(): Promise<void> {
    if (this.busy || !this.nearTableId) return;
    if (this.offline) {
      this.toast('Offline preview — ordering needs the API', 0xcc8844);
      return;
    }
    const v = this.tableViews.get(this.nearTableId);
    if (!v) return;
    this.busy = true;
    try {
      if (v.table.state === 'EMPTY') {
        await api.order(v.table.id);
        this.toast('Ordered! The AutoServeBot is on it…');
      } else if (v.table.state === 'SERVED') {
        await api.collect(v.table.id);
        this.toast('Collected ✔');
      }
    } catch (err) {
      this.toast((err as Error).message, 0xcc4444);
    } finally {
      this.busy = false;
    }
  }

  // ---------- Phase 1: vending machines ----------
  private async loadVending(): Promise<void> {
    try {
      const machines = await api.vending();
      machines.filter((m) => m.floor === this.floor).forEach((m) => this.upsertVending(m));
    } catch {
      /* vending list is non-critical */
    }
  }

  private upsertVending(m: VendingMachineView): void {
    let v = this.vendingViews.get(m.id);
    if (!v) {
      let sprite: Phaser.GameObjects.Image | undefined;
      const c = isoPos(m.grid_x + 0.5, m.grid_y + 0.5);
      const anchorY = c.y + TILE_H * 0.35;
      if (this.tex('vending')) {
        this.groundShadow(c.x, anchorY, TILE_W * 0.72, anchorY - 1);
        sprite = this.add.image(c.x, anchorY, 'vending').setOrigin(0.5, 1).setDepth(anchorY);
        // 1-tile footprint, ~150px tall per the grid standards
        const w = TILE_W * 0.85;
        sprite.setDisplaySize(w, (w * sprite.height) / sprite.width);
      }
      this.add
        .text(c.x, anchorY - (sprite?.displayHeight ?? 150) - 12, `${m.code} · vending`, {
          color: '#ffffff',
          fontSize: '12px',
          backgroundColor: '#00000099',
          padding: { x: 4, y: 1 },
        })
        .setOrigin(0.5)
        .setDepth(9000);
      v = { m, sprite };
      this.vendingViews.set(m.id, v);
    }
    v.m = m;
    this.refreshVendingPanel();
  }

  private applyVendingStock(machineId: string, slotId: string, stock: number): void {
    const v = this.vendingViews.get(machineId);
    if (!v) return;
    const slot = v.m.slots.find((s) => s.id === slotId);
    if (slot) slot.stock = stock;
    this.refreshVendingPanel();
  }

  private toggleVendingPanel(): void {
    if (this.vendingPanel) {
      this.closeVendingPanel();
    } else {
      this.refreshVendingPanel(true);
    }
  }

  private closeVendingPanel(): void {
    this.vendingPanel?.destroy();
    this.vendingPanel = undefined;
  }

  private refreshVendingPanel(open = false): void {
    if (!this.vendingPanel && !open) return;
    if (!this.nearMachineId) return;
    const v = this.vendingViews.get(this.nearMachineId);
    if (!v) return;
    this.closeVendingPanel();

    const lines = v.m.slots.map(
      (s, i) => `[${i + 1}] ${s.item_name}  ·  ${s.price}c  ·  ${s.stock > 0 ? `${s.stock} left` : 'SOLD OUT'}`,
    );
    const w = 300;
    const h = 62 + lines.length * 22;
    const g = this.add.graphics();
    g.fillStyle(0xf5ead7, 0.97);
    g.lineStyle(3, 0x1e3d34, 1);
    g.fillRoundedRect(0, 0, w, h, 12);
    g.strokeRoundedRect(0, 0, w, h, 12);
    const title = this.add.text(14, 10, `${v.m.code} — Vending`, {
      color: '#1e3d34',
      fontSize: '15px',
      fontStyle: 'bold',
    });
    const items = this.add.text(14, 38, lines.join('\n'), {
      color: '#41372a',
      fontSize: '13px',
      lineSpacing: 8,
    });
    const foot = this.add.text(14, h - 20, 'press 1-4 to buy · [E] close', {
      color: '#8a5a2b',
      fontSize: '11px',
    });
    this.vendingPanel = this.add
      .container(this.scale.width / 2 - w / 2, this.scale.height - h - 76, [g, title, items, foot])
      .setScrollFactor(0)
      .setDepth(10001);
  }

  private async onBuyVending(slotIdx: number): Promise<void> {
    if (this.busy || !this.nearMachineId) return;
    const v = this.vendingViews.get(this.nearMachineId);
    if (!v || slotIdx >= v.m.slots.length) return;
    const slot = v.m.slots[slotIdx];
    if (this.offline) {
      this.toast('Offline preview — buying needs the API', 0xcc8844);
      return;
    }
    if (slot.stock <= 0) {
      this.toast('Sold out', 0xcc8844);
      return;
    }
    if (this.coins < slot.price) {
      this.toast('Not enough coins', 0xcc4444);
      return;
    }
    this.busy = true;
    try {
      const res = await api.vendingBuy(slot.id);
      slot.stock = res.stock;
      this.coins -= slot.price;
      this.updateHud();
      this.refreshVendingPanel();
      this.playVendingDrop(v.m);
      this.toast(`${slot.item_name} — got it! (-${slot.price})`);
    } catch (err) {
      this.toast((err as Error).message, 0xcc4444);
    } finally {
      this.busy = false;
    }
  }

  /** Little "item drops out of the machine" animation. */
  private playVendingDrop(m: VendingMachineView): void {
    const c = isoPos(m.grid_x + 0.5, m.grid_y + 0.5);
    const startY = c.y + TILE_H * 0.35 - 90;
    const item = this.add
      .text(c.x, startY, '🥤', { fontSize: '22px' })
      .setOrigin(0.5)
      .setDepth(9500);
    this.tweens.add({
      targets: item,
      y: c.y + TILE_H * 0.3,
      duration: 420,
      ease: 'Bounce.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: item,
          alpha: 0,
          y: item.y - 26,
          delay: 320,
          duration: 380,
          onComplete: () => item.destroy(),
        });
      },
    });
  }

  // ---------- Phase 1: photo booth ----------
  private placePhotoBooth(): void {
    const cx = isoPos(BOOTH.gx + BOOTH.w / 2, BOOTH.gy + BOOTH.h / 2);
    const anchorY = cx.y + TILE_H * 0.7;
    if (this.tex('photobooth')) {
      this.groundShadow(cx.x, anchorY, TILE_W * 1.4, anchorY - 1);
      const img = this.add.image(cx.x, anchorY, 'photobooth').setOrigin(0.5, 1).setDepth(anchorY);
      // 2×2-tile footprint, ~200px tall per the grid standards
      const w = TILE_W * 1.7;
      img.setDisplaySize(w, (w * img.height) / img.width);
    }
    this.add
      .text(cx.x, anchorY + 8, '📸 photo booth', {
        color: '#ffffff',
        fontSize: '12px',
        backgroundColor: '#00000099',
        padding: { x: 4, y: 1 },
      })
      .setOrigin(0.5, 0)
      .setDepth(9000);
  }

  private boothCenter(): { x: number; y: number } {
    return isoPos(BOOTH.gx + BOOTH.w / 2, BOOTH.gy + BOOTH.h / 2);
  }

  private enterPhotoMode(): void {
    if (this.photoMode) return;
    this.photoMode = true;
    const c = this.boothCenter();
    this.photoBackdrop = this.add
      .rectangle(c.x, c.y - 40, 360, 250, PHOTO_BACKDROPS[this.photoBackdropIdx].color)
      .setStrokeStyle(6, 0x1e3d34)
      .setDepth(c.y - 200)
      .setAlpha(0.96);
    this.toast('Photo mode: 1-3 backdrop · SPACE shoot · ESC exit', 0x2f6f6a);
  }

  private exitPhotoMode(): void {
    if (!this.photoMode) return;
    this.photoMode = false;
    this.photoBackdrop?.destroy();
    this.photoBackdrop = undefined;
  }

  private async onCapturePhoto(): Promise<void> {
    if (!this.photoMode || this.busy) return;
    if (this.offline) {
      this.toast('Offline preview — photos need the API', 0xcc8844);
      return;
    }
    this.busy = true;
    // hide chrome so the shot is clean
    const chrome = [this.hud, this.hint, this.toastText, this.questPanel].filter(Boolean);
    chrome.forEach((o) => (o as Phaser.GameObjects.Container).setVisible(false));
    try {
      const cam = this.cameras.main;
      const c = this.boothCenter();
      const w = 420;
      const h = 320;
      const sx = Phaser.Math.Clamp(c.x - cam.scrollX - w / 2, 0, Math.max(0, this.scale.width - w));
      const sy = Phaser.Math.Clamp(c.y - 60 - cam.scrollY - h / 2, 0, Math.max(0, this.scale.height - h));
      const blob = await this.snapshotBlob(sx, sy, w, h);
      const photo = await api.uploadPhoto(blob, PHOTO_BACKDROPS[this.photoBackdropIdx].name, '');
      this.toast(`📸 Saved to your album! (share: …${photo.share_token.slice(-6)})`, 0x2ea36a);
      this.exitPhotoMode();
    } catch (err) {
      this.toast((err as Error).message, 0xcc4444);
    } finally {
      chrome.forEach((o) => (o as Phaser.GameObjects.Container).setVisible(true));
      if (this.questPanel) this.questPanel.setVisible(this.questPanelVisible);
      this.busy = false;
    }
  }

  /** Canvas-renderer snapshot of a screen region -> PNG blob. */
  private snapshotBlob(x: number, y: number, w: number, h: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      this.game.renderer.snapshotArea(x, y, w, h, (img) => {
        const el = img as HTMLImageElement;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('no 2d context'));
          return;
        }
        ctx.drawImage(el, 0, 0);
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('snapshot failed'))), 'image/png');
      });
    });
  }

  // ---------- Phase 1: quest tracker ----------
  private async loadQuests(): Promise<void> {
    try {
      this.quests = await api.quests();
      this.redrawQuestPanel();
    } catch {
      /* quests are non-critical for rendering */
    }
  }

  private createQuestPanel(): void {
    this.redrawQuestPanel();
  }

  private toggleQuestPanel(): void {
    this.questPanelVisible = !this.questPanelVisible;
    this.questPanel?.setVisible(this.questPanelVisible);
  }

  /** Rounded warm-cream card per the TECH-UI spec (soft shadow, green outline). */
  private redrawQuestPanel(): void {
    this.questPanel?.destroy();
    const shown = this.quests
      .filter((q) => q.status !== 'CLAIMED')
      .sort((a, b) => (a.status === 'COMPLETED' ? -1 : 0) - (b.status === 'COMPLETED' ? -1 : 0))
      .slice(0, 4);
    const w = 280;
    const rowH = 46;
    const h = 40 + Math.max(shown.length, 1) * rowH;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.18); // soft shadow
    g.fillRoundedRect(4, 6, w, h, 14);
    g.fillStyle(0xf5ead7, 0.96);
    g.lineStyle(3, 0x1e3d34, 1);
    g.fillRoundedRect(0, 0, w, h, 14);
    g.strokeRoundedRect(0, 0, w, h, 14);
    const parts: Phaser.GameObjects.GameObject[] = [g];
    parts.push(
      this.add.text(14, 10, 'Quests  ·  [Q] hide', {
        color: '#1e3d34',
        fontSize: '14px',
        fontStyle: 'bold',
      }),
    );
    if (shown.length === 0) {
      parts.push(
        this.add.text(14, 40, this.offline ? 'offline preview' : 'all clear! 🎉', {
          color: '#8a5a2b',
          fontSize: '12px',
        }),
      );
    }
    shown.forEach((q, i) => {
      const y = 36 + i * rowH;
      const progress = q.type === 'COMMUNITY' ? (q.community_progress ?? 0) : q.progress;
      const done = q.status === 'COMPLETED';
      parts.push(
        this.add.text(14, y, `${done ? '✔ ' : ''}${q.title}`, {
          color: done ? '#2ea36a' : '#41372a',
          fontSize: '12px',
          fontStyle: done ? 'bold' : 'normal',
        }),
      );
      // thin progress bar
      const barW = w - 28;
      const pct = Math.min(1, progress / Math.max(1, q.target));
      const bar = this.add.graphics();
      bar.fillStyle(0xd9c9a8, 1);
      bar.fillRoundedRect(14, y + 20, barW, 7, 4);
      bar.fillStyle(done ? 0x2ea36a : 0xc97f56, 1);
      if (pct > 0) bar.fillRoundedRect(14, y + 20, Math.max(8, barW * pct), 7, 4);
      parts.push(bar);
      parts.push(
        this.add
          .text(w - 14, y, `${Math.min(progress, q.target)}/${q.target}`, {
            color: '#8a5a2b',
            fontSize: '11px',
          })
          .setOrigin(1, 0),
      );
    });
    this.questPanel = this.add
      .container(this.scale.width - w - 14, 14, parts)
      .setScrollFactor(0)
      .setDepth(10000)
      .setVisible(this.questPanelVisible);
    this.scale.on('resize', () => this.questPanel?.setX(this.scale.width - w - 14));
  }

  // ---------- Phase 1: AutoServeBot (visible worker, grid A*) ----------
  private createBot(): void {
    const body = this.add.rectangle(0, 0, 26, 34, 0x2f6f6a).setStrokeStyle(2, 0x0b1a22);
    const apron = this.add.rectangle(0, 8, 20, 14, 0xf2e3c8).setStrokeStyle(1, 0x0b1a22);
    const label = this.add
      .text(0, -30, 'AutoServeBot', { color: '#c8f7e2', fontSize: '11px' })
      .setOrigin(0.5);
    this.bot = this.add.container(0, 0, [body, apron, label]);
    const p = isoPos(this.botPos.gx + 0.5, this.botPos.gy + 0.5);
    this.bot.setPosition(p.x, p.y).setDepth(p.y);
  }

  /** React to table changes: walk to ORDERED tables (serve) and COLLECTED
   * tables (clean). State itself stays fully server-authoritative — the bot
   * you see is the visual worker for what the server already decided. */
  private onTableForBot(t: TableView): void {
    if (t.state !== 'ORDERED' && t.state !== 'COLLECTED') return;
    const target: Cell = { gx: t.grid_x, gy: t.grid_y + 1 }; // stand just below the table
    const kind = t.state === 'ORDERED' ? 'serving' : 'cleaning';
    // drop stale queued trips to the same table
    this.botQueue = this.botQueue.filter((j) => j.target.gx !== target.gx || j.target.gy !== target.gy);
    this.botQueue.push({ target, kind });
    if (this.botState === 'idle' || this.botState === 'returning') this.nextBotJob();
  }

  private nextBotJob(): void {
    const job = this.botQueue.shift();
    if (!job) {
      // head home
      this.botPath = findPath(COLS, ROWS, this.blockedTiles, this.botPos, BOT_HOME);
      this.botState = this.botPath.length > 0 ? 'returning' : 'idle';
      return;
    }
    this.botPath = findPath(COLS, ROWS, this.blockedTiles, this.botPos, job.target);
    this.botState = this.botPath.length > 0 ? job.kind : 'idle';
  }

  private stepBot(dt: number): void {
    if (!this.bot) return;
    if (this.botPath.length === 0) {
      if (this.botState === 'returning') this.botState = 'idle';
      else if (this.botState !== 'idle') {
        // arrived at a table — brief pause, then next job
        this.botState = 'idle';
        this.time.delayedCall(600, () => this.nextBotJob());
      }
      return;
    }
    const next = this.botPath[0];
    const tx = next.gx + 0.5;
    const ty = next.gy + 0.5;
    const dx = tx - (this.botPos.gx + 0.5);
    const dy = ty - (this.botPos.gy + 0.5);
    const dist = Math.hypot(dx, dy);
    const step = BOT_SPEED_TILES * dt;
    if (dist <= step) {
      this.botPos = { gx: next.gx, gy: next.gy };
      this.botPath.shift();
    } else {
      this.botPos = {
        gx: this.botPos.gx + (dx / dist) * step,
        gy: this.botPos.gy + (dy / dist) * step,
      };
    }
    const p = isoPos(this.botPos.gx + 0.5, this.botPos.gy + 0.5);
    this.bot.setPosition(p.x, p.y).setDepth(p.y);
  }

  // ---------- loop ----------
  update(time: number, dtMs: number): void {
    if (!this.avatar) return;
    const dt = dtMs / 1000;

    // screen-space input vector
    let ix = 0;
    let iy = 0;
    if (this.keys.A.isDown || this.cursors.left.isDown) ix -= 1;
    if (this.keys.D.isDown || this.cursors.right.isDown) ix += 1;
    if (this.keys.W.isDown || this.cursors.up.isDown) iy -= 1;
    if (this.keys.S.isDown || this.cursors.down.isDown) iy += 1;

    if (ix !== 0 || iy !== 0) {
      // screen direction -> grid delta (keeps WASD visually screen-aligned)
      let dgx = ix + iy;
      let dgy = iy - ix;
      const len = Math.hypot(dgx, dgy);
      if (len > 0) {
        dgx /= len;
        dgy /= len;
      }
      // min 1.15: keep the avatar out of the perimeter wall footprint
      this.pos.gx = Phaser.Math.Clamp(this.pos.gx + dgx * SPEED_TILES * dt, 1.15, COLS - 0.3);
      this.pos.gy = Phaser.Math.Clamp(this.pos.gy + dgy * SPEED_TILES * dt, 1.15, ROWS - 0.3);
      const s = isoPos(this.pos.gx, this.pos.gy);
      this.avatar.setPosition(s.x, s.y).setDepth(s.y);
      this.dir = Math.abs(ix) >= Math.abs(iy) ? (ix > 0 ? 'right' : 'left') : iy > 0 ? 'down' : 'up';
      if (!this.offline && time - this.lastSent > 80) {
        this.lastSent = time;
        this.ws?.sendMove(this.pos.gx, this.pos.gy, this.dir, this.floor);
      }
    }
    this.stepBot(dt);
    this.updateProximity();
  }

  private updateProximity(): void {
    let near: string | undefined;
    this.tableViews.forEach((v) => {
      const d = Math.hypot(
        this.pos.gx - (v.table.grid_x + 0.5),
        this.pos.gy - (v.table.grid_y + 0.5),
      );
      if (d < 1.7) near = v.table.id;
    });
    this.nearTableId = near;

    let nearMachine: string | undefined;
    this.vendingViews.forEach((v) => {
      const d = Math.hypot(
        this.pos.gx - (v.m.grid_x + 0.5),
        this.pos.gy - (v.m.grid_y + 0.5),
      );
      if (d < 1.7) nearMachine = v.m.id;
    });
    if (this.nearMachineId && nearMachine !== this.nearMachineId) this.closeVendingPanel();
    this.nearMachineId = nearMachine;

    const onG = this.floor === 1;
    const bc = { x: BOOTH.gx + BOOTH.w / 2, y: BOOTH.gy + BOOTH.h / 2 };
    this.nearBooth = onG && Math.hypot(this.pos.gx - bc.x, this.pos.gy - bc.y) < 2.2;
    if (!this.nearBooth && this.photoMode) this.exitPhotoMode();

    const wasNearCabinet = this.nearCabinet;
    this.nearCabinet =
      onG && Math.hypot(this.pos.gx - (CABINET.gx + 0.5), this.pos.gy - (CABINET.gy + 0.5)) < 1.8;
    if (wasNearCabinet && !this.nearCabinet) this.closeCoasterPanel();

    this.nearGacha =
      onG && Math.hypot(this.pos.gx - (GACHA.gx + 0.5), this.pos.gy - (GACHA.gy + 0.5)) < 1.6;

    const wasNearLift = this.nearLift;
    this.nearLift =
      Math.hypot(this.pos.gx - ELEVATOR.gx, this.pos.gy - (ELEVATOR.gy + 1)) < 2.0 ||
      Math.hypot(this.pos.gx - (STAIRS.gx + 0.4), this.pos.gy - (STAIRS.gy + 0.6)) < 2.0;
    if (wasNearLift && !this.nearLift) this.closeFloorPanel();

    this.nearNpcId = undefined;
    if (this.npcActor) {
      const onShift = this.npcs.find((n) => n.on_shift);
      if (
        onShift &&
        Math.hypot(this.pos.gx - WorldScene.NPC_SPOT.gx, this.pos.gy - WorldScene.NPC_SPOT.gy) < 2.2
      ) {
        this.nearNpcId = onShift.id;
      }
    }

    // nearest other player within cheers range (server re-verifies)
    this.nearPlayerId = undefined;
    let bestD = 2.2;
    this.others.forEach((o, id) => {
      const d = Math.hypot(this.pos.gx - o.gx, this.pos.gy - o.gy);
      if (d < bestD) {
        bestD = d;
        this.nearPlayerId = id;
      }
    });

    let h = '';
    if (this.photoMode) {
      h = '📸 1-3 backdrop · SPACE shoot · ESC exit';
    } else if (this.floorPanel) {
      h = '🛗 press 1-3 to travel · [E] close';
    } else if (this.nearLift) {
      h = '[E] Elevator / stairs';
    } else if (this.nearCabinet) {
      h = this.coasterPanel ? '[E] close collection' : '[E] Coaster collection';
    } else if (this.nearGacha) {
      h = '[E] Gachapon — 25c a capsule';
    } else if (near) {
      const t = this.tableViews.get(near)!.table;
      h =
        t.state === 'EMPTY'
          ? `[E] Order at ${t.code}`
          : t.state === 'SERVED'
            ? `[E] Collect ${t.code}`
            : `${t.code}: ${t.state.toLowerCase()}…`;
    } else if (nearMachine) {
      h = this.vendingPanel ? '[1-4] buy · [E] close' : '[E] Vending machine';
    } else if (this.nearBooth) {
      h = '[E] Photo booth';
    } else if (
      !this.offline &&
      this.floor === 1 &&
      this.pos.gx >= 13 &&
      this.pos.gy >= 7 &&
      this.pos.gy <= 20
    ) {
      // §4 adapted: chilling in the bar zone earns passive XP server-side
      h = '☕ chill zone — cozy XP ticks every minute · shifts on the Job board';
    }
    if (this.nearPlayerId && !this.photoMode) {
      const o = this.others.get(this.nearPlayerId);
      const name = o ? (o.c.list[1] as Phaser.GameObjects.Text).text : 'player';
      h = h ? `${h}  ·  [C] Cheers with ${name}` : `[C] Cheers with ${name} 🍻`;
    }
    if (this.nearNpcId && !this.photoMode) {
      const n = this.npcs.find((x) => x.id === this.nearNpcId);
      h = h
        ? `${h}  ·  [T] Talk to ${n?.name ?? 'NPC'}`
        : `[T] Talk to ${n?.name ?? 'NPC'} ☆ (Lv.${n?.heart_level ?? 0})`;
    }
    this.hint.setText(h);
  }
}
