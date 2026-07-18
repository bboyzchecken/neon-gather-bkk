import Phaser from 'phaser';
import type {
  Direction,
  PlayerState,
  Plot,
  ServerMessage,
  TableView,
  User,
} from '@neon/shared-types';
import { facadeKey } from '../assets';
import { COLS, ROWS, SPEED_TILES, TILE_H, TILE_W, WORLD_H, WORLD_W, isoPos } from '../config';
import { api } from '../net/api';
import { connectWorld, type WorldSocket } from '../net/socket';

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
    this.drawDecor();
    this.createAvatar();
    this.createHud();
    this.setupInput();
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.startFollow(this.avatar, true, 0.1, 0.1);

    if (this.offline) {
      DEMO_PLOTS.forEach((p) => this.drawPlot(p));
      DEMO_TABLES.forEach((t) => this.upsertTable(t));
      this.toast('Offline preview — start the API for full play', 0x8a5a2b);
    } else {
      void this.loadPlots();
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
    const isoKey = this.makeIsoFloor('floor_terracotta');
    if (isoKey) {
      this.groundRT = this.add.renderTexture(0, 0, WORLD_W, WORLD_H).setOrigin(0).setDepth(0);
      this.blitFloor(isoKey, 0, 0, COLS, ROWS);
    } else {
      // fallback: flat-shaded diamonds
      const g = this.add.graphics().setDepth(0);
      for (let gy = 0; gy < ROWS; gy++) {
        for (let gx = 0; gx < COLS; gx++) {
          g.fillStyle((gx + gy) % 2 === 0 ? 0xc97f56 : 0xd18a60, 1);
          this.fillDiamond(g, gx, gy);
        }
      }
    }
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
      `${this.me.display_name}   💰 ${this.coins}${mode}\nWASD/Arrows move · click plot to rent · [E] order/collect at tables`,
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
    kb.on('keydown-E', () => void this.onInteractTable());
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
      this.pos.gx = Phaser.Math.Clamp(this.pos.gx + dgx * SPEED_TILES * dt, 0.3, COLS - 0.3);
      this.pos.gy = Phaser.Math.Clamp(this.pos.gy + dgy * SPEED_TILES * dt, 0.3, ROWS - 0.3);
      const s = isoPos(this.pos.gx, this.pos.gy);
      this.avatar.setPosition(s.x, s.y).setDepth(s.y);
      this.dir = Math.abs(ix) >= Math.abs(iy) ? (ix > 0 ? 'right' : 'left') : iy > 0 ? 'down' : 'up';
      if (!this.offline && time - this.lastSent > 80) {
        this.lastSent = time;
        this.ws?.sendMove(this.pos.gx, this.pos.gy, this.dir);
      }
    }
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

    let h = '';
    if (near) {
      const t = this.tableViews.get(near)!.table;
      h =
        t.state === 'EMPTY'
          ? `[E] Order at ${t.code}`
          : t.state === 'SERVED'
            ? `[E] Collect ${t.code}`
            : `${t.code}: ${t.state.toLowerCase()}…`;
    }
    this.hint.setText(h);
  }
}
