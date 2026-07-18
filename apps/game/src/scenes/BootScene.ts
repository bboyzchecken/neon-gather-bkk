import Phaser from 'phaser';
import { resolveAuth } from '../auth';
import { api, setToken } from '../net/api';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
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
      this.scene.start('World', { me, token });
    } catch (err) {
      label.setText('Failed to connect: ' + ((err as Error)?.message ?? 'unknown'));
      label.setColor('#ff9b9b');
    }
  }
}
