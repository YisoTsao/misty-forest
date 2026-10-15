import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import { ClientMessage, PROTOCOL_VERSION, ROOM_NAME, ServerMessage, type CorrectionMessage } from '@/game-core/net/protocol';
import { MAPS, NEW_GAME_SPAWN } from '@/game-core/world/maps';
import { createGameServer } from './app';
import type { WorldRoom } from './WorldRoom';

let colyseus: ColyseusTestServer;

beforeAll(async () => {
  colyseus = await boot(createGameServer(), 2598);
});
afterAll(async () => {
  await colyseus.shutdown();
});
beforeEach(async () => {
  await colyseus.cleanup();
});

const join = (room: WorldRoom, options: Record<string, unknown> = {}) => colyseus.connectTo(room, { protocol: PROTOCOL_VERSION, ...options });
let sentAt = 0;
const at = (x: number, y: number, z: number, anim = 'idle') => ({ t: (sentAt += 50), x, y, z, yaw: 0, anim });

/** 等到條件成立（輪詢）。不用 room.waitForNextMessage：@colyseus/testing 在前一則訊息排的 timer 可能晚觸發、提早 resolve 下一次等待 */
async function until(cond: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('等待逾時');
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** 讓房間的時鐘可以手動前進 */
function manualClock(room: WorldRoom): { advance(ms: number): void } {
  let t = 1_000_000;
  room.now = () => t;
  return { advance: (ms) => (t += ms) };
}

describe('世界房間：加入與離開', () => {
  it('加入時分配玩家 id 與名稱，沒帶位置就放在出生點（客戶端從初始狀態讀到）', async () => {
    const room = (await colyseus.createRoom(ROOM_NAME, {})) as WorldRoom;
    const client = await join(room, { name: '  小旅人\n' });
    const player = room.state.players.get(client.sessionId)!;
    expect(player.playerId).toMatch(/^p\d+-/);
    expect(player.name).toBe('小旅人');
    expect(player.map).toBe('dawnvale');
    expect(Math.hypot(player.x - NEW_GAME_SPAWN.x, player.z - NEW_GAME_SPAWN.z)).toBeLessThan(2);
    const mine = (client.state as { players: Map<string, { x: number; z: number }> }).players.get(client.sessionId);
    // 同步用 float32，比對到小數第四位
    expect(mine!.x).toBeCloseTo(player.x, 4);
    expect(mine!.z).toBeCloseTo(player.z, 4);
  });

  it('兩個人看得到彼此；一個離開後從狀態移除', async () => {
    const room = (await colyseus.createRoom(ROOM_NAME, {})) as WorldRoom;
    const a = await join(room, { name: 'A', at: at(0, 1, 10) });
    const b = await join(room, { name: 'B', at: at(2, 1, 10) });
    await b.waitForNextPatch();
    expect(room.state.players.size).toBe(2);
    const seen = [...(b.state as { players: Map<string, { name: string }> }).players.values()].map((p) => p.name).sort();
    expect(seen).toEqual(['A', 'B']);
    await a.leave();
    await room.waitForNextPatch();
    expect(room.state.players.size).toBe(1);
    expect(room.state.players.has(b.sessionId)).toBe(true);
  });

  it('帶來的位置在其他地圖也採用，地圖由伺服器判斷', async () => {
    const room = (await colyseus.createRoom(ROOM_NAME, {})) as WorldRoom;
    const g = MAPS.mirrorlake.origin;
    const client = await join(room, { at: at(g.x + 5, 2, g.z - 3) });
    expect(room.state.players.get(client.sessionId)).toMatchObject({ map: 'mirrorlake', location: 'overworld' });
  });

  it('協定版本不同就拒絕加入', async () => {
    const room = (await colyseus.createRoom(ROOM_NAME, {})) as WorldRoom;
    await expect(colyseus.connectTo(room, { protocol: PROTOCOL_VERSION + 1 })).rejects.toThrow();
    expect(room.state.players.size).toBe(0);
  });
});

describe('世界房間：移動驗證', () => {
  it('正常的移動會更新位置與動畫', async () => {
    const room = (await colyseus.createRoom(ROOM_NAME, {})) as WorldRoom;
    const clock = manualClock(room);
    const client = await join(room, { at: at(0, 1, 10) });
    clock.advance(100);
    client.send(ClientMessage.move, { ...at(0.5, 1, 10, 'run'), yaw: 1.2 });
    await room.waitForNextMessage();
    expect(room.state.players.get(client.sessionId)).toMatchObject({ x: 0.5, anim: 'run' });
    expect(room.state.players.get(client.sessionId)!.yaw).toBeCloseTo(1.2);
  });

  it('瞬移的座標不採用，並要客戶端拉回原位', async () => {
    const room = (await colyseus.createRoom(ROOM_NAME, {})) as WorldRoom;
    const clock = manualClock(room);
    const client = await join(room, { at: at(0, 1, 10) });
    clock.advance(50);
    client.send(ClientMessage.move, at(80, 1, 10));
    const correction = (await client.waitForMessage(ServerMessage.correction)) as CorrectionMessage;
    expect(correction).toMatchObject({ x: 0, z: 10, reason: 'speed' });
    expect(room.state.players.get(client.sessionId)!.x).toBe(0);
    expect(room.rejectedCount(client.sessionId)).toBe(1);
  });

  it('可玩區外的位置不採用', async () => {
    const room = (await colyseus.createRoom(ROOM_NAME, {})) as WorldRoom;
    const clock = manualClock(room);
    const client = await join(room, { at: at(0, 1, 10) });
    clock.advance(50);
    client.send(ClientMessage.warp, at(500, 1, 0));
    const correction = (await client.waitForMessage(ServerMessage.correction)) as CorrectionMessage;
    expect(correction.reason).toBe('bounds');
  });

  it('合法的瞬移可以，但 1.5 秒內不能連續瞬移', async () => {
    const room = (await colyseus.createRoom(ROOM_NAME, {})) as WorldRoom;
    const clock = manualClock(room);
    const client = await join(room, { at: at(0, 1, 10) });
    const g = MAPS.glowmoss.origin;
    client.send(ClientMessage.warp, at(g.x, 2, g.z));
    await room.waitForNextMessage();
    expect(room.state.players.get(client.sessionId)).toMatchObject({ map: 'glowmoss' });
    clock.advance(500);
    client.send(ClientMessage.warp, at(0, 1, 10));
    const correction = (await client.waitForMessage(ServerMessage.correction)) as CorrectionMessage;
    expect(correction.reason).toBe('warp');
    expect(room.state.players.get(client.sessionId)!.map).toBe('glowmoss');
    clock.advance(1500);
    client.send(ClientMessage.warp, at(0, 1, 10));
    await until(() => room.state.players.get(client.sessionId)!.map === 'dawnvale');
  });

  it('格式不對的訊息（NaN、未知動畫、多餘欄位）直接忽略', async () => {
    const room = (await colyseus.createRoom(ROOM_NAME, {})) as WorldRoom;
    const clock = manualClock(room);
    const client = await join(room, { at: at(0, 1, 10) });
    clock.advance(100);
    client.send(ClientMessage.move, { ...at(0.2, 1, 10), x: 'NaN' });
    client.send(ClientMessage.move, at(0.2, 1, 10, 'fly'));
    client.send(ClientMessage.move, { ...at(0.2, 1, 10), health: 999 });
    await until(() => room.rejectedCount(client.sessionId) === 3);
    expect(room.state.players.get(client.sessionId)!.x).toBe(0);
    expect(room.state.players.get(client.sessionId)!.health).toBe(100);
  });

  it('每秒超過 30 則的訊息直接丟棄', async () => {
    const room = (await colyseus.createRoom(ROOM_NAME, {})) as WorldRoom;
    const clock = manualClock(room);
    const client = await join(room, { at: at(0, 1, 10) });
    clock.advance(1000);
    for (let i = 1; i <= 40; i++) client.send(ClientMessage.move, at(i * 0.01, 1, 10));
    await new Promise((r) => setTimeout(r, 150));
    expect(room.state.players.get(client.sessionId)!.x).toBeCloseTo(0.3);
  });
});

describe('世界房間：斷線續玩（任務 11C）', () => {
  /** 模擬網路中斷：以「可以重連」的關閉代碼關掉連線（伺服器走 onDrop，SDK 會自動重連） */
  const MAY_TRY_RECONNECT = 4010;
  /** 記錄伺服器有沒有走到 onDrop（重連很快時，輪詢可能錯過離線的那一刻） */
  const watchDrop = (room: WorldRoom) => {
    const seen = { dropped: false, offline: false };
    const original = room.onDrop.bind(room);
    room.onDrop = (client) => {
      seen.dropped = true;
      original(client);
      seen.offline = room.state.players.get(client.sessionId)?.online === false;
    };
    return seen;
  };

  it('斷線時保留座位、標記離線；自動重連回來是同一個人並恢復在線', async () => {
    const room = (await colyseus.createRoom(ROOM_NAME, {})) as WorldRoom;
    const a = await join(room, { name: 'A', at: at(0, 1, 10) });
    const b = await join(room, { name: 'B', at: at(2, 1, 10) });
    const sessionBefore = a.sessionId;
    // 重連等 200 ms 才開始：比伺服器的同步間隔（50 ms）長，B 才看得到 A 離線的那一段
    a.reconnection.minUptime = 0;
    a.reconnection.minDelay = 200;
    a.reconnection.delay = 200;
    let reconnected = false;
    a.onReconnect(() => (reconnected = true));
    // B 看到的 A：斷線期間還在、只是離線（重連很快，記錄有沒有看過離線的那一刻）
    let bSawOffline = false;
    b.onStateChange((state) => {
      const p = (state as { players: Map<string, { online: boolean }> }).players.get(a.sessionId);
      if (p && !p.online) bSawOffline = true;
    });
    const drop = watchDrop(room);
    a.connection.close(MAY_TRY_RECONNECT, 'test');
    await until(() => bSawOffline);
    await until(() => reconnected);
    expect(drop).toEqual({ dropped: true, offline: true });
    expect(a.sessionId).toBe(sessionBefore);
    await until(() => room.state.players.get(a.sessionId)?.online === true);
    expect(room.state.players.size).toBe(2);
  });

  it('重連回來後第一則位置當合法的瞬移（斷線期間自己走動過）', async () => {
    const room = (await colyseus.createRoom(ROOM_NAME, {})) as WorldRoom;
    const a = await join(room, { name: 'A', at: at(0, 1, 10) });
    a.send(ClientMessage.warp, at(5, 1, 10));
    await until(() => Math.abs(room.state.players.get(a.sessionId)!.x - 5) < 0.01);
    a.reconnection.minUptime = 0;
    a.reconnection.minDelay = 10;
    a.reconnection.delay = 10;
    let reconnected = false;
    a.onReconnect(() => (reconnected = true));
    a.connection.close(MAY_TRY_RECONNECT, 'test');
    await until(() => reconnected);
    // 距上次 warp 不到 1.5 秒，但重連後允許一次
    a.send(ClientMessage.warp, at(30, 1, 10));
    await until(() => Math.abs(room.state.players.get(a.sessionId)!.x - 30) < 0.01);
    expect(room.rejectedCount(a.sessionId)).toBe(0);
  });

  it('保留時間內沒有回來：從狀態移除', async () => {
    const room = (await colyseus.createRoom(ROOM_NAME, {})) as WorldRoom;
    room.reconnectSeconds = 0.2;
    const a = await join(room, { name: 'A', at: at(0, 1, 10) });
    const b = await join(room, { name: 'B', at: at(2, 1, 10) });
    a.reconnection.enabled = false;
    a.connection.close(MAY_TRY_RECONNECT, 'test');
    await until(() => room.state.players.get(a.sessionId)?.online === false);
    await until(() => !room.state.players.has(a.sessionId), 2000);
    expect(room.state.players.has(b.sessionId)).toBe(true);
  });

  it('主動離開不保留座位，馬上移除', async () => {
    const room = (await colyseus.createRoom(ROOM_NAME, {})) as WorldRoom;
    const a = await join(room, { name: 'A', at: at(0, 1, 10) });
    await join(room, { name: 'B', at: at(2, 1, 10) });
    await a.leave(true);
    await until(() => !room.state.players.has(a.sessionId), 500);
  });
});
