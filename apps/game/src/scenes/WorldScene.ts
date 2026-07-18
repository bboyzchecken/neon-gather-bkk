import Phaser from 'phaser';
import type {
  Direction,
  PlayerState,
  Plot,
  ServerMessage,
  TableView,
  User,
} from '@neon/shared-types';
import { AVATAR_SPEED, CELL, WORLD_COLS, WORLD_ROWS } from '../config';
import { api } from '../net/api';
import { connectWorld, type WorldSocket } from '../net/socket';

interface PlotView {
  plot: Plot;
  rect: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}
interface TableViewObj {
  table: TableView;
  rect: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

export class WorldScene extends Phaser.Scene {
  private me!: User;
  private token = '';
  private coins = 0;
  private ws?: WorldSocket;

  private avatar!: Phaser.GameObjects.Container;
  private dir: Direction = 'down';
  private others = new Map<string, Phaser.GameObjects.Container>();

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

  init(data: { me: User; token: string }): void {
    this.me = data.me;
    this.token = data.token;
    this.coins = data.me.coins;
  }

  create(): void {
    this.drawGrid();
    this.createAvatar();
    this.createHud();
    this.setupInput();
    this.cameras.main.setBounds(0, 0, WORLD_COLS * CELL, WORLD_ROWS * CELL);
    this.cameras.main.startFollow(this.avatar, true, 0.1, 0.1);
    void this.loadPlots();
    this.connectSocket();
    this.events.once('shutdown', () => this.ws?.close());
  }

  // ---------- world drawing ----------
  private drawGrid(): void {
    const w = WORLD_COLS * CELL;
    const h = WORLD_ROWS * CELL;
    this.add.rectangle(0, 0, w, h, 0x16323f).setOrigin(0);
    const g = this.add.graphics();
    g.lineStyle(1, 0x244253, 0.6);
    for (let x = 0; x <= WORLD_COLS; x++) g.lineBetween(x * CELL, 0, x * CELL, h);
    for (let y = 0; y <= WORLD_ROWS; y++) g.lineBetween(0, y * CELL, w, y * CELL);
  }

  private makeActor(color: number, name: string): Phaser.GameObjects.Container {
    const body = this.add.rectangle(0, 0, 26, 34, color).setStrokeStyle(2, 0x0b1a22);
    const label = this.add.text(0, -30, name, { color: '#eaf6ff', fontSize: '12px' }).setOrigin(0.5);
    return this.add.container(0, 0, [body, label]).setDepth(5);
  }

  private createAvatar(): void {
    this.avatar = this.makeActor(0x7fd6ff, this.me.display_name);
    this.avatar.setPosition((WORLD_COLS / 2) * CELL, (WORLD_ROWS / 2) * CELL);
  }

  // ---------- HUD ----------
  private createHud(): void {
    this.hud = this.add
      .text(12, 10, '', { color: '#eaf6ff', fontSize: '14px', backgroundColor: '#000000aa', padding: { x: 8, y: 6 } })
      .setScrollFactor(0)
      .setDepth(100);
    this.hint = this.add
      .text(12, this.scale.height - 58, '', {
        color: '#ffe9a8',
        fontSize: '14px',
        backgroundColor: '#000000aa',
        padding: { x: 8, y: 6 },
      })
      .setScrollFactor(0)
      .setDepth(100);
    this.toastText = this.add
      .text(this.scale.width / 2, 60, '', { color: '#ffffff', fontSize: '16px', padding: { x: 12, y: 8 } })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(100)
      .setAlpha(0);
    this.updateHud();
    this.scale.on('resize', () => {
      this.hint.setY(this.scale.height - 58);
      this.toastText.setX(this.scale.width / 2);
    });
  }

  private updateHud(): void {
    this.hud.setText(
      `${this.me.display_name}   💰 ${this.coins}\nWASD/Arrows move · click plot to rent · [E] order/collect at tables`,
    );
  }

  private toast(msg: string, color = 0x22bb77): void {
    this.toastText
      .setText(msg)
      .setBackgroundColor('#' + color.toString(16).padStart(6, '0'))
      .setAlpha(1);
    this.tweens.killTweensOf(this.toastText);
    this.time.delayedCall(2200, () =>
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

  private drawPlot(p: Plot): void {
    const x = p.grid_x * CELL;
    const y = p.grid_y * CELL;
    const rect = this.add
      .rectangle(x, y, p.width_tiles * CELL, p.height_tiles * CELL, this.plotColor(p), 0.55)
      .setOrigin(0)
      .setStrokeStyle(2, 0x0b1a22)
      .setInteractive({ useHandCursor: true });
    const label = this.add.text(x + 6, y + 6, this.plotLabel(p), {
      color: '#eaf6ff',
      fontSize: '12px',
    });
    rect.on('pointerdown', () => void this.onRentPlot(p.id));
    this.plotViews.push({ plot: p, rect, label });
  }

  private plotColor(p: Plot): number {
    if (p.is_mine) return 0x2ea36a;
    if (p.status === 'RENTED') return 0x8a5a2b;
    return 0x3a6b82;
  }

  private plotLabel(p: Plot): string {
    const who = p.is_mine ? 'YOU' : (p.owner_name ?? 'vacant');
    return `${p.code}\n${p.status === 'VACANT' ? 'rent ' + p.rent_price : who}`;
  }

  private async onRentPlot(plotId: string): Promise<void> {
    if (this.busy) return;
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
      view.rect.setFillStyle(this.plotColor(updated), 0.55);
      view.label.setText(this.plotLabel(updated));
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
    let c = this.others.get(p.id);
    if (!c) {
      c = this.makeActor(0xffd27f, p.display_name);
      this.others.set(p.id, c);
    }
    c.setPosition(p.x, p.y);
  }

  private removeOther(id: string): void {
    const c = this.others.get(id);
    if (c) {
      c.destroy();
      this.others.delete(id);
    }
  }

  private upsertTable(t: TableView): void {
    const x = t.grid_x * CELL;
    const y = t.grid_y * CELL;
    let v = this.tableViews.get(t.id);
    if (!v) {
      const rect = this.add
        .rectangle(x, y, CELL - 6, CELL - 6, this.tableColor(t.state), 0.9)
        .setOrigin(0)
        .setStrokeStyle(2, 0x0b1a22);
      const label = this.add.text(x + 2, y - 14, '', { color: '#eaf6ff', fontSize: '11px' });
      v = { table: t, rect, label };
      this.tableViews.set(t.id, v);
    }
    v.table = t;
    v.rect.setFillStyle(this.tableColor(t.state), 0.9);
    v.label.setText(`${t.code}:${t.state[0]}`);
  }

  private tableColor(s: TableView['state']): number {
    if (s === 'EMPTY') return 0x445c6b;
    if (s === 'ORDERED') return 0xc9a227;
    if (s === 'SERVED') return 0x2ea36a;
    return 0x9b6dff;
  }

  // ---------- actions ----------
  private async onInteractTable(): Promise<void> {
    if (this.busy || !this.nearTableId) return;
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
    let vx = 0;
    let vy = 0;
    if (this.keys.A.isDown || this.cursors.left.isDown) vx -= 1;
    if (this.keys.D.isDown || this.cursors.right.isDown) vx += 1;
    if (this.keys.W.isDown || this.cursors.up.isDown) vy -= 1;
    if (this.keys.S.isDown || this.cursors.down.isDown) vy += 1;

    if (vx !== 0 || vy !== 0) {
      const len = Math.hypot(vx, vy);
      vx /= len;
      vy /= len;
      const nx = Phaser.Math.Clamp(this.avatar.x + vx * AVATAR_SPEED * dt, 0, WORLD_COLS * CELL);
      const ny = Phaser.Math.Clamp(this.avatar.y + vy * AVATAR_SPEED * dt, 0, WORLD_ROWS * CELL);
      this.avatar.setPosition(nx, ny);
      this.dir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : vy > 0 ? 'down' : 'up';
      if (time - this.lastSent > 80) {
        this.lastSent = time;
        this.ws?.sendMove(nx, ny, this.dir);
      }
    }
    this.updateProximity();
  }

  private updateProximity(): void {
    let near: string | undefined;
    this.tableViews.forEach((v) => {
      const cx = v.table.grid_x * CELL + CELL / 2;
      const cy = v.table.grid_y * CELL + CELL / 2;
      if (Phaser.Math.Distance.Between(cx, cy, this.avatar.x, this.avatar.y) < CELL * 1.4) {
        near = v.table.id;
      }
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
