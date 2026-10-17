// 遊戲伺服器的設定（房間、路由、傳輸層）。index.ts 啟動、測試以 @colyseus/testing 的 boot() 載入同一份設定。
import { createEndpoint, createRouter, defineRoom, defineServer, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { PROTOCOL_VERSION, ROOM_NAME } from '@/game-core/net/protocol';
import { isAllowedOrigin, type OriginRule } from './origins';
import { WorldRoom } from './WorldRoom';

const startedAt = Date.now();

/** 健康檢查：部署平台與 e2e 用來確認伺服器已就緒；now 讓沒有連線的客戶端也能對時（共享日光，T-181） */
const health = createEndpoint('/health', { method: 'GET' }, async () => {
  const rooms = await matchMaker.query({ name: ROOM_NAME });
  const players = rooms.reduce((sum, r) => sum + r.clients, 0);
  return Response.json({ ok: true, protocol: PROTOCOL_VERSION, rooms: rooms.length, players, uptimeSec: Math.round((Date.now() - startedAt) / 1000), now: Date.now() });
});

/**
 * @param allowedOrigins 連線來源允許清單（空的 = 全部允許，任務 11D）。三個地方檢查：
 * 比對房間的 HTTP 請求（WorldRoom.onAuth）、WebSocket 升級（含斷線重連，beforeUpgrade）、CORS 標頭只回允許的來源。
 */
export function createGameServer(options: { allowedOrigins?: OriginRule[] } = {}) {
  const rules = options.allowedOrigins ?? [];
  WorldRoom.originRules = rules;
  // 預設的 CORS 標頭含 `Access-Control-Allow-Origin: *`，而且會先放、再合併 getCorsHeaders 的結果：有允許清單時拿掉
  if (rules.length > 0) delete (matchMaker.controller.DEFAULT_CORS_HEADERS as Record<string, string>)['Access-Control-Allow-Origin'];
  matchMaker.controller.getCorsHeaders = (headers: Headers): Record<string, string> => {
    const origin = headers.get('origin');
    return isAllowedOrigin(origin, rules) ? { 'Access-Control-Allow-Origin': origin || '*' } : {};
  };
  return defineServer({
    transport: new WebSocketTransport({
      pingInterval: 3000,
      pingMaxRetries: 2,
      beforeUpgrade: (request) => {
        if (isAllowedOrigin(request.headers.get('origin'), rules)) return;
        console.warn(`[world] 拒絕來源 ${request.headers.get('origin')} 的連線`);
        return new Response('origin not allowed', { status: 403 });
      },
    }),
    rooms: { [ROOM_NAME]: defineRoom(WorldRoom) },
    routes: createRouter({ health }),
    greet: false,
  });
}
