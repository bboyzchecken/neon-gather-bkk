import type { Direction, ServerMessage } from '@neon/shared-types';
import { API_URL } from '../config';

export interface WorldSocket {
  sendMove(x: number, y: number, dir: Direction): void;
  close(): void;
}

export function connectWorld(
  token: string,
  onMessage: (msg: ServerMessage) => void,
): WorldSocket {
  const url = API_URL.replace(/^http/, 'ws') + '/ws?token=' + encodeURIComponent(token);
  const ws = new WebSocket(url);

  ws.onmessage = (ev) => {
    try {
      onMessage(JSON.parse(ev.data as string) as ServerMessage);
    } catch {
      /* ignore malformed frames */
    }
  };

  return {
    sendMove(x, y, dir) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'move', x, y, dir }));
      }
    },
    close() {
      ws.close();
    },
  };
}
