import { request } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, ROOM_NAME } from '@/game-core/net/protocol';
import { createGameServer } from './app';
import { parseAllowedOrigins } from './origins';

// 部署時的來源允許清單（任務 11D）：以實際的 HTTP 請求確認比對房間與 WebSocket 升級都會擋下其他網站
const PORT = 2596;
const ALLOWED = 'https://mistwood.vercel.app';
// 不用 @colyseus/testing 的 boot：傳入已建立的 Server 時它一律用 2568 埠，會和 WorldRoom.test 搶同一個埠
const server = createGameServer({ allowedOrigins: parseAllowedOrigins(`${ALLOWED},null`) });

beforeAll(async () => {
  await server.listen(PORT, 'localhost');
});
afterAll(async () => {
  await server.gracefullyShutdown(false);
});

const matchmake = (origin?: string) =>
  fetch(`http://localhost:${PORT}/matchmake/joinOrCreate/${ROOM_NAME}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
    body: JSON.stringify({ protocol: PROTOCOL_VERSION, name: 'T' }),
  });

/** 送出 WebSocket 升級請求，回傳伺服器的 HTTP 狀態（101 = 升級成功） */
function upgradeStatus(origin: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({
      port: PORT,
      host: 'localhost',
      path: '/some-room/some-session',
      headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==', Origin: origin },
    });
    req.on('upgrade', (res, socket) => {
      socket.destroy();
      resolve(res.statusCode ?? 0);
    });
    req.on('response', (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end();
  });
}

describe('連線來源允許清單：實際的請求（任務 11D）', () => {
  it('允許的來源可以比對房間，CORS 回同一個來源', async () => {
    const res = await matchmake(ALLOWED);
    expect(res.ok).toBe(true);
    expect(res.headers.get('access-control-allow-origin')).toBe(ALLOWED);
    expect(((await res.json()) as { sessionId?: string }).sessionId).toBeTruthy();
  });

  it('Electron（Origin: null）與沒有 Origin 的請求可以', async () => {
    expect((await matchmake('null')).ok).toBe(true);
    expect((await matchmake()).ok).toBe(true);
  });

  it('其他網站：比對房間被拒、CORS 不回允許標頭', async () => {
    const res = await matchmake('https://evil.example');
    expect(res.ok).toBe(false);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('其他網站直接開 WebSocket（例如拿別人的重連憑證）：升級被拒 403', async () => {
    expect(await upgradeStatus('https://evil.example')).toBe(403);
  });
});
