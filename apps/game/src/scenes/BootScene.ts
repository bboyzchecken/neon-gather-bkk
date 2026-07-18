import Phaser from 'phaser';
import type { User } from '@neon/shared-types';
import { TEXTURES } from '../assets';
import { resolveAuth } from '../auth';
import { api, setToken } from '../net/api';

const OFFLINE_USER: User = {
  id: 'offline-preview',
  email: null,
  display_name: 'Preview',
  role: 'GUEST',
  is_guest: true,
  coins: 0,
};

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    // Missing files just warn — every draw call has a rectangle fallback.
    this.load.on('loaderror', (f: Phaser.Loader.File) => {
      // eslint-disable-next-line no-console
      console.warn('[assets] missing', f.key);
    });
    Object.entries(TEXTURES).forEach(([key, file]) => {
      this.load.image(key, `assets/${file}`);
    });
  }

  create(): void {
    const label = this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'Connecting to Neon Gather BKK…', {
        color: '#cfe8ff',
        fontSize: '18px',
      })
      .setOrigin(0.5);

    void this.boot(label);
  }

  private async boot(label: Phaser.GameObjects.Text): Promise<void> {
    try {
      const { token, user } = await resolveAuth();
      setToken(token);
      const me = await api.me().catch(() => user);
      this.scene.start('World', { me, token, offline: false });
    } catch {
      // API unreachable -> offline preview so assets are still visible.
      label.setText('API offline — entering preview mode');
      this.time.delayedCall(700, () =>
        this.scene.start('World', { me: OFFLINE_USER, token: '', offline: true }),
      );
    }
  }
}
