// 遊戲伺服器的設定（房間、路由、傳輸層）。index.ts 啟動、測試以 @colyseus/testing 的 boot() 載入同一份設定。
import { createEndpoint, createRouter, defineRoom, defineServer, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { PROTOCOL_VERSION, ROOM_NAME } from '@/game-core/net/protocol';
import { WorldRoom } from './WorldRoom';

const startedAt = Date.now();

/** 健康檢查：部署平台與 e2e 用來確認伺服器已就緒 */
const health = createEndpoint('/health', { method: 'GET' }, async () => {
  const rooms = await matchMaker.query({ name: ROOM_NAME });
  const players = rooms.reduce((sum, r) => sum + r.clients, 0);
  return Response.json({ ok: true, protocol: PROTOCOL_VERSION, rooms: rooms.length, players, uptimeSec: Math.round((Date.now() - startedAt) / 1000) });
});

export function createGameServer() {
  return defineServer({
    transport: new WebSocketTransport({ pingInterval: 3000, pingMaxRetries: 2 }),
    rooms: { [ROOM_NAME]: defineRoom(WorldRoom) },
    routes: createRouter({ health }),
    greet: false,
  });
}
