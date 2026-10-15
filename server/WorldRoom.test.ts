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
    await room.waitForNextMessage();
    expect(room.state.players.get(client.sessionId)!.map).toBe('dawnvale');
  });

  it('格式不對的訊息（NaN、未知動畫、多餘欄位）直接忽略', async () => {
    const room = (await colyseus.createRoom(ROOM_NAME, {})) as WorldRoom;
    const clock = manualClock(room);
    const client = await join(room, { at: at(0, 1, 10) });
    clock.advance(100);
    client.send(ClientMessage.move, { ...at(0.2, 1, 10), x: 'NaN' });
    client.send(ClientMessage.move, at(0.2, 1, 10, 'fly'));
    client.send(ClientMessage.move, { ...at(0.2, 1, 10), health: 999 });
    await room.waitForNextMessage(50);
    expect(room.state.players.get(client.sessionId)!.x).toBe(0);
    expect(room.state.players.get(client.sessionId)!.health).toBe(100);
    expect(room.rejectedCount(client.sessionId)).toBe(3);
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
