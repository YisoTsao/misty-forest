// 羊群（規格 4.3 生活感細節）：純本機的環境動畫，不存檔、不經過權威層。
// 每隻羊在牧草地範圍內輪流「休息 / 吃草 / 漫步」，玩家靠近時走開；玩家遠離時整群暫停（不更新）。
import { z } from 'zod';
import { mulberry32 } from '../util/random';

export const flockSchema = z.object({
  id: z.string().min(1),
  /** 牧草地中心與半徑（公尺） */
  center: z.tuple([z.number(), z.number()]),
  radius: z.number().positive(),
  count: z.number().int().positive().max(16),
  seed: z.number().int(),
});
export type FlockDef = z.infer<typeof flockSchema>;

export function parseFlocks(raw: unknown): FlockDef[] {
  return z.array(flockSchema).parse(raw);
}

export type SheepMode = 'rest' | 'graze' | 'walk' | 'flee';
export type Sheep = {
  x: number;
  z: number;
  yaw: number;
  mode: SheepMode;
  /** 目前狀態剩餘秒數 */
  timer: number;
  targetX: number;
  targetZ: number;
  /** 0–1 的隨機種子（動畫相位等） */
  phase: number;
};

export const SHEEP = {
  walkSpeed: 0.9,
  fleeSpeed: 2.4,
  turnRate: 3,
  /** 玩家進入這個距離就走開 */
  fleeRadius: 3.2,
  /** 玩家超過這個距離時整群暫停 */
  pauseDistance: 70,
  /** 兩隻羊之間保持的距離 */
  spacing: 1.1,
} as const;

export function createFlock(def: FlockDef): Sheep[] {
  const rand = mulberry32(def.seed);
  return Array.from({ length: def.count }, () => {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * def.radius * 0.8;
    const x = def.center[0] + Math.cos(a) * r;
    const z = def.center[1] + Math.sin(a) * r;
    return { x, z, yaw: rand() * Math.PI * 2, mode: 'graze' as SheepMode, timer: 1 + rand() * 4, targetX: x, targetZ: z, phase: rand() };
  });
}

export function flockPaused(def: FlockDef, playerX: number, playerZ: number): boolean {
  return Math.hypot(playerX - def.center[0], playerZ - def.center[1]) > SHEEP.pauseDistance + def.radius;
}

function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** 把點限制在牧草地內 */
function clampToArea(def: FlockDef, x: number, z: number): [number, number] {
  const dx = x - def.center[0];
  const dz = z - def.center[1];
  const d = Math.hypot(dx, dz);
  if (d <= def.radius) return [x, z];
  return [def.center[0] + (dx / d) * def.radius, def.center[1] + (dz / d) * def.radius];
}

/** 下一個狀態：休息 25%、吃草 35%、漫步 40% */
function nextMode(sheep: Sheep, def: FlockDef, rand: () => number): void {
  const r = rand();
  if (r < 0.25) {
    sheep.mode = 'rest';
    sheep.timer = 6 + rand() * 8;
  } else if (r < 0.6) {
    sheep.mode = 'graze';
    sheep.timer = 3 + rand() * 5;
  } else {
    sheep.mode = 'walk';
    sheep.timer = 8;
    const a = rand() * Math.PI * 2;
    const step = 1.5 + rand() * 3;
    [sheep.targetX, sheep.targetZ] = clampToArea(def, sheep.x + Math.cos(a) * step, sheep.z + Math.sin(a) * step);
  }
}

/**
 * 更新整群一步（原地修改）。rand 由呼叫端提供（測試可固定）。
 * 走動時面向前進方向；彼此太近時互相推開；不會離開牧草地。
 */
export function stepFlock(flock: Sheep[], def: FlockDef, player: { x: number; z: number }, dt: number, rand: () => number): void {
  for (const s of flock) {
    const px = s.x - player.x;
    const pz = s.z - player.z;
    const pd = Math.hypot(px, pz);
    if (pd < SHEEP.fleeRadius && s.mode !== 'flee') {
      // 往遠離玩家的方向小跑一段
      s.mode = 'flee';
      s.timer = 2.5;
      const away = pd > 1e-3 ? [px / pd, pz / pd] : [1, 0];
      [s.targetX, s.targetZ] = clampToArea(def, s.x + away[0]! * 4, s.z + away[1]! * 4);
    }
    s.timer -= dt;
    if (s.mode === 'walk' || s.mode === 'flee') {
      const dx = s.targetX - s.x;
      const dz = s.targetZ - s.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.15 || s.timer <= 0) {
        nextMode(s, def, rand);
      } else {
        const want = Math.atan2(dx, dz);
        s.yaw += angleDelta(s.yaw, want) * Math.min(1, SHEEP.turnRate * dt);
        // 轉向還沒對準時慢慢走
        const align = Math.max(0, Math.cos(angleDelta(s.yaw, want)));
        const speed = (s.mode === 'flee' ? SHEEP.fleeSpeed : SHEEP.walkSpeed) * align;
        const stepLen = Math.min(d, speed * dt);
        s.x += Math.sin(s.yaw) * stepLen;
        s.z += Math.cos(s.yaw) * stepLen;
      }
    } else if (s.timer <= 0) {
      nextMode(s, def, rand);
    }
  }
  // 彼此推開
  for (let i = 0; i < flock.length; i++) {
    for (let j = i + 1; j < flock.length; j++) {
      const a = flock[i]!;
      const b = flock[j]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d >= SHEEP.spacing || d < 1e-6) continue;
      const push = (SHEEP.spacing - d) / 2;
      a.x -= (dx / d) * push;
      a.z -= (dz / d) * push;
      b.x += (dx / d) * push;
      b.z += (dz / d) * push;
    }
  }
  for (const s of flock) [s.x, s.z] = clampToArea(def, s.x, s.z);
}
