import Phaser from 'phaser';
import type {
  Direction,
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

/** Offline preview data (mirrors the seeder) so assets render without the API. */
const DEMO_PLOTS: Plot[] = [0, 1, 2, 3, 4, 5].map((i) => {
  const gx = 2 + (i % 3) * 6;
  const gy = 2 + Math.floor(i / 3) * 7;
  const templates = ['CAFE', 'VINTAGE', 'STREETFOOD'] as const;
  const rented = i === 1 || i === 4;
  return {
    id: `demo-${i}`,
    code: `A-0${i + 1}`,
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

/** AutoServeBot home position (beside the bar counter). */
const BOT_HOME: Cell = { gx: 14, gy: 17 };
const BOT_SPEED_TILES = 2.6;

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
  private blockedTiles = new Set<number>();
  private bot?: Phaser.GameObjects.Container;
  private botPos: Cell = { ...BOT_HOME };
  private botPath: Cell[] = [];
  private botState: 'idle' | 'serving' | 'cleaning' | 'returning' = 'idle';
  private botQueue: Array<{ target: Cell; kind: 'serving' | 'cleaning' }> = [];

  constructor() {
    super('World');
  }

  init(data: { me: User; token: string; offline?: boolean }): void {
    this.me = data.me;
    this.token = data.token;
    this.offline = data.offline ?? false;
    this.coins = data.me.coins;
    this.pos = { gx: COLS / 2, gy: ROWS / 2 };
  }

  create(): void {
    this.drawGround();
    this.drawInteriorShell();
    this.drawDecor();
    this.createAvatar();
    this.createHud();
    this.drawAmbient();
    this.setupInput();
    // perimeter wall tiles are impassable for the AutoServeBot
    for (let gx = 0; gx < COLS; gx++) this.blockedTiles.add(gx);
    for (let gy = 0; gy < ROWS; gy++) this.blockedTiles.add(gy * COLS);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.startFollow(this.avatar, true, 0.1, 0.1);

    this.placePhotoBooth();
    this.createBot();
    this.createQuestPanel();

    if (this.offline) {
      DEMO_PLOTS.forEach((p) => this.drawPlot(p));
      DEMO_TABLES.forEach((t) => this.upsertTable(t));
      DEMO_VENDING.forEach((m) => this.upsertVending(m));
      // let the bot demo its serve/clean walk on the preview tables
      DEMO_TABLES.forEach((t) => this.onTableForBot(t));
      this.toast('Offline preview — start the API for full play', 0x8a5a2b);
    } else {
      void this.loadPlots();
      void this.loadVending();
      void this.loadQuests();
      this.connectSocket();
    }
    this.events.once('shutdown', () => this.ws?.close());
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
    // Interior hall: polished concrete everywhere, terracotta walkway cross
    // (entrance corridor + food-court promenade) guiding the flow.
    const conc = this.makeIsoFloor('floor_concrete');
    const terra = this.makeIsoFloor('floor_terracotta');
    if (conc || terra) {
      this.groundRT = this.add.renderTexture(0, 0, WORLD_W, WORLD_H).setOrigin(0).setDepth(0);
      if (conc) this.blitFloor(conc, 0, 0, COLS, ROWS);
      if (terra) {
        this.blitFloor(terra, ENTRANCE.start, 1, ENTRANCE.width, ROWS - 1);
        this.blitFloor(terra, 1, 14, COLS - 1, 4);
      }
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
        quad(a, b, 0.24, 0.76, 80, 142, 0x9fd3cd, 0.95); // glass
        quad(a, b, 0.24, 0.76, 80, 111, 0xc3e6e1, 0.5); // sky sheen
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

    // north-east wall (gy = 0) with the entrance doors
    for (let gx = 0; gx < COLS; gx++) {
      const a = isoPos(gx, 0);
      const b = isoPos(gx + 1, 0);
      const inDoor = gx >= ENTRANCE.start && gx < ENTRANCE.start + ENTRANCE.width;
      bay(a, b, 0xe6d5b8, inDoor ? 'door' : gx % 4 === 2 ? 'window' : 'plain');
    }
    // north-west wall (gx = 0)
    for (let gy = 0; gy < ROWS; gy++) {
      const a = isoPos(0, gy);
      const b = isoPos(0, gy + 1);
      bay(a, b, 0xf2e6cf, gy % 4 === 2 ? 'window' : 'plain');
    }
    // columns every 4 tiles + the corner
    for (let gx = 0; gx <= COLS; gx += 4) {
      column(isoPos(gx, 0), isoPos(gx + 1, 0));
    }
    for (let gy = 4; gy <= ROWS; gy += 4) {
      column(isoPos(0, gy), isoPos(0, gy + 1));
    }

    // warm light spill on the floor inside the entrance
    const doorMid = isoPos(ENTRANCE.start + ENTRANCE.width / 2, 0.9);
    g.fillStyle(0xffdf9e, 0.12);
    g.fillEllipse(doorMid.x, doorMid.y + 26, TILE_W * 3.4, TILE_H * 2.6);

    this.drawStringLights(g);

    // low cutaway walls on the two FRONT edges close the room without hiding
    // the interior (drawn above world objects — they sit closest to camera)
    const f = this.add.graphics().setDepth(8000);
    const fq = (
      a: { x: number; y: number },
      b: { x: number; y: number },
      h0: number,
      h1: number,
      color: number,
      alpha = 1,
    ): void => {
      f.fillStyle(color, alpha);
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
    const LOW = 42;
    for (let gy = 0; gy < ROWS; gy++) {
      const a = isoPos(COLS, gy);
      const b = isoPos(COLS, gy + 1);
      fq(a, b, 0, LOW, 0xe6d5b8);
      fq(a, b, LOW - 7, LOW, 0x8a5a2b); // teak cap rail
      fq(a, b, 0, 8, 0x16302a);
    }
    for (let gx = 0; gx < COLS; gx++) {
      const a = isoPos(gx, ROWS);
      const b = isoPos(gx + 1, ROWS);
      fq(a, b, 0, LOW, 0xf2e6cf);
      fq(a, b, LOW - 7, LOW, 0x8a5a2b);
      fq(a, b, 0, 8, 0x16302a);
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
      pts.forEach((p, i) => {
        if (i % 2 === 0) {
          g.fillStyle(0xffd98a, 0.22);
          g.fillCircle(p.x, p.y + 3, 7);
          g.fillStyle(0xffe9b0, 0.95);
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
      g.fillStyle(0x1a1006, 0.09);
      g.fillRect(0, 0, w, h);
      // faked gradient vignette: two bands per edge
      const bands: Array<[number, number]> = [
        [18, 0.16],
        [46, 0.07],
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
    const img = this.add.image(p.x, y, key).setOrigin(0.5, 1).setDepth(y);
    img.setDisplaySize(widthPx, (widthPx * img.height) / img.width);
  }

  private drawDecor(): void {
    this.placeProp('counter_bar', 15.6, 16.2, TILE_W * 2.9);
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
    const body = this.add.rectangle(0, 0, 26, 34, color).setStrokeStyle(2, 0x0b1a22);
    const label = this.add.text(0, -30, name, { color: '#eaf6ff', fontSize: '12px' }).setOrigin(0.5);
    return this.add.container(0, 0, [body, label]);
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
      `${this.me.display_name}   💰 ${this.coins}${mode}\nWASD/Arrows move · click plot to rent · [E] tables/vending/booth · [Q] quests`,
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
    kb.on('keydown-ESC', () => this.exitPhotoMode());
    kb.on('keydown-SPACE', () => void this.onCapturePhoto());
    for (let n = 1; n <= 4; n++) {
      kb.on(`keydown-${'ONE TWO THREE FOUR'.split(' ')[n - 1]}`, () => void this.onDigit(n));
    }
  }

  private async onDigit(n: number): Promise<void> {
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
      plots.forEach((p) => this.drawPlot(p));
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
      facade = this.add.image(cx, anchorY, fk).setOrigin(0.5, 1).setDepth(anchorY);
      const w = TILE_W * 2.7;
      facade.setDisplaySize(w, (w * facade.height) / facade.width);
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
        msg.tables.forEach((t) => this.upsertTable(t));
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
        this.upsertTable(msg.table);
        this.onTableForBot(msg.table);
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
            : `🪙 Coaster collected: ${msg.shop_code}`,
          0x2ea36a,
        );
        break;
    }
  }

  private upsertOther(p: PlayerState): void {
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
      if (this.tex('table_round')) {
        sprite = this.add.image(c.x, anchorY, 'table_round').setOrigin(0.5, 1).setDepth(anchorY);
        const w = TILE_W * 0.95;
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
      machines.forEach((m) => this.upsertVending(m));
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
        this.ws?.sendMove(this.pos.gx, this.pos.gy, this.dir);
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

    const bc = { x: BOOTH.gx + BOOTH.w / 2, y: BOOTH.gy + BOOTH.h / 2 };
    this.nearBooth = Math.hypot(this.pos.gx - bc.x, this.pos.gy - bc.y) < 2.2;
    if (!this.nearBooth && this.photoMode) this.exitPhotoMode();

    let h = '';
    if (this.photoMode) {
      h = '📸 1-3 backdrop · SPACE shoot · ESC exit';
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
    }
    this.hint.setText(h);
  }
}
