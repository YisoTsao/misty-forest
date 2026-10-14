// 掉落重置用的安全點（規格 6.1：掉出地圖 → 重置至最近安全點，不得卡死）。
// 玩家站穩在地圖內時沿途記錄位置；掉落時回到離掉落處最近的一個。
import { mapAt } from './maps';

export type SafePoint = { x: number; y: number; z: number };

export type SafePointTrail = {
  /** 由舊到新，最多 maxPoints 個 */
  points: SafePoint[];
  /** 上次記錄後已站穩的時間（秒） */
  groundedFor: number;
};

export type SafePointOptions = {
  /** 可遊玩範圍的半寬（以所在地圖的原點為中心的正方形） */
  halfExtent: number;
  /** 離可遊玩範圍邊緣至少這麼遠才算安全 */
  edgeMargin: number;
  /** 兩個安全點之間的最小水平距離 */
  minSpacing: number;
  /** 需要持續站穩多久才記錄（避免把跳躍落點的瞬間當成安全） */
  settleTime: number;
  maxPoints: number;
};

export const defaultSafePointOptions: SafePointOptions = {
  halfExtent: 154,
  edgeMargin: 6,
  minSpacing: 2,
  settleTime: 0.3,
  maxPoints: 32,
};

export function createSafePointTrail(initial: SafePoint): SafePointTrail {
  return { points: [{ ...initial }], groundedFor: 0 };
}

export function isInsidePlayArea(x: number, z: number, opts: SafePointOptions): boolean {
  const { origin } = mapAt(x, z);
  const limit = opts.halfExtent - opts.edgeMargin;
  return Math.abs(x - origin.x) <= limit && Math.abs(z - origin.z) <= limit;
}

/** 每幀呼叫：玩家持續站穩且位置合格時記錄一個安全點。直接修改 trail。 */
export function recordSafePoint(
  trail: SafePointTrail,
  pos: SafePoint,
  grounded: boolean,
  dt: number,
  opts: SafePointOptions = defaultSafePointOptions,
): void {
  trail.groundedFor = grounded ? trail.groundedFor + dt : 0;
  if (trail.groundedFor < opts.settleTime) return;
  if (!isInsidePlayArea(pos.x, pos.z, opts)) return;
  const last = trail.points[trail.points.length - 1];
  if (last && Math.hypot(last.x - pos.x, last.z - pos.z) < opts.minSpacing) return;
  trail.points.push({ x: pos.x, y: pos.y, z: pos.z });
  if (trail.points.length > opts.maxPoints) trail.points.shift();
}

/** 離 from 水平距離最近的安全點；距離相同時取較新的。沒有任何點時回傳 fallback。 */
export function nearestSafePoint(trail: SafePointTrail, from: { x: number; z: number }, fallback: SafePoint): SafePoint {
  let best: SafePoint | null = null;
  let bestD = Infinity;
  for (let i = trail.points.length - 1; i >= 0; i--) {
    const p = trail.points[i]!;
    const d = Math.hypot(p.x - from.x, p.z - from.z);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best ? { ...best } : { ...fallback };
}
