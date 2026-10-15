// 伺服器端的移動驗證（決策 T-168）：客戶端照舊用 Rapier 移動並回報位置，伺服器以自己收到訊息的時間
// 計算這段時間最多能走多遠，超過就不採用；位置必須在某張地圖的可玩區或某個室內。純函式，伺服器與測試共用。
import { boundaryDistance } from '@/game-core/world/bounds';
import { mapAt, type MapId } from '@/game-core/world/maps';
import { OVERWORLD } from '@/game-core/world/interiors';
import type { CorrectionReason } from './protocol';

export type Vec3 = { x: number; y: number; z: number };

export type MoveLimits = {
  /** 水平速度上限（m/s） */
  maxSpeed: number;
  /** 垂直速度上限（m/s，跳躍與落下） */
  maxVerticalSpeed: number;
  /** 不論經過多久都允許的位移（m）：吸收網路抖動與碰撞推擠 */
  allowance: number;
  /** 經過時間的上限（秒）：停很久後也不能一次走很遠 */
  maxElapsed: number;
};

/** 依角色資料算出上限：跑步加上近戰突進的最快速度，再留 25% 餘裕 */
export function moveLimitsFor(locomotion: { runSpeed: number; jumpVelocity: number; gravity: number }, maxLunge: number): MoveLimits {
  return {
    maxSpeed: (locomotion.runSpeed + maxLunge) * 1.25,
    // 往上不會超過起跳速度；往下以重力加速一秒為上限（掉出地圖會重生，走 warp）
    maxVerticalSpeed: Math.max(locomotion.jumpVelocity, locomotion.gravity) * 1.25,
    allowance: 1,
    maxElapsed: 1,
  };
}

export type MoveCheck = { ok: true } | { ok: false; reason: CorrectionReason };

/** 從上一個合法位置到新位置，在經過的時間內是否走得到 */
export function checkMove(prev: Vec3, next: Vec3, elapsedSec: number, limits: MoveLimits): MoveCheck {
  const elapsed = Math.min(Math.max(elapsedSec, 0), limits.maxElapsed);
  const horizontal = Math.hypot(next.x - prev.x, next.z - prev.z);
  if (horizontal > limits.maxSpeed * elapsed + limits.allowance) return { ok: false, reason: 'speed' };
  if (Math.abs(next.y - prev.y) > limits.maxVerticalSpeed * elapsed + limits.allowance) return { ok: false, reason: 'vertical' };
  return { ok: true };
}

/** 可玩區外多遠內仍接受（m）：邊界是軟牆，角色可能被推出一點點 */
const BOUNDS_MARGIN = 4;
/** 室內子場景的範圍（與 game-core/world/interiors.ts 的 interiorAt 相同） */
const INTERIOR_RADIUS = 30;

export type InteriorZone = { id: string; origin: readonly [number, number] };
export type Zone = { map: MapId; location: string };

/** 位置所在的地圖與室內；不在任何可玩範圍內時為 null。地圖與室內由伺服器判斷，不採用客戶端的說法 */
export function zoneAt(x: number, z: number, interiors: readonly InteriorZone[]): Zone | null {
  for (const i of interiors) if (Math.hypot(x - i.origin[0], z - i.origin[1]) < INTERIOR_RADIUS) return { map: 'dawnvale', location: i.id };
  const map = mapAt(x, z);
  if (boundaryDistance(x - map.origin.x, z - map.origin.z, map.bounds) < -BOUNDS_MARGIN) return null;
  return { map: map.id, location: OVERWORLD };
}

/** 瞬移的頻率限制 */
export function canWarp(lastWarpAt: number | null, now: number, minIntervalMs: number): boolean {
  return lastWarpAt === null || now - lastWarpAt >= minIntervalMs;
}

/** 每秒訊息數的軟限制：回傳是否接受這則訊息（會更新 counter） */
export function acceptRate(counter: { windowStart: number; count: number }, now: number, perSecond: number): boolean {
  if (now - counter.windowStart >= 1000) {
    counter.windowStart = now;
    counter.count = 0;
  }
  counter.count++;
  return counter.count <= perSecond;
}

/** 武器資料裡最快的突進速度（weapons.json 的 lunge 欄位，任何層級） */
export function maxLungeIn(raw: unknown): number {
  let max = 0;
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (k === 'lunge' && typeof x === 'number') max = Math.max(max, x);
        else visit(x);
      }
    }
  };
  visit(raw);
  return max;
}
