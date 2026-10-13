import { describe, expect, it } from 'vitest';
import { createSafePointTrail, defaultSafePointOptions, nearestSafePoint, recordSafePoint } from './safePoints';

const opts = { ...defaultSafePointOptions, halfExtent: 80, edgeMargin: 6, minSpacing: 2, settleTime: 0.3, maxPoints: 4 };
const spawn = { x: 0, y: 1, z: 18 };

/** 以 0.1 秒為一步沿 x 軸走到 toX，全程站穩 */
function walk(trail: ReturnType<typeof createSafePointTrail>, fromX: number, toX: number, grounded = true) {
  for (let x = fromX; x <= toX; x += 0.5) recordSafePoint(trail, { x, y: 1, z: 0 }, grounded, 0.1, opts);
}

describe('safe points', () => {
  it('站穩一段時間後才記錄，且點與點之間保持最小距離', () => {
    const trail = createSafePointTrail(spawn);
    recordSafePoint(trail, { x: 10, y: 1, z: 0 }, true, 0.1, opts);
    expect(trail.points).toHaveLength(1); // 還沒站穩
    recordSafePoint(trail, { x: 10, y: 1, z: 0 }, true, 0.25, opts);
    expect(trail.points).toHaveLength(2);
    recordSafePoint(trail, { x: 11, y: 1, z: 0 }, true, 0.1, opts);
    expect(trail.points).toHaveLength(2); // 太近
  });

  it('在空中不記錄，落地後需重新站穩', () => {
    const trail = createSafePointTrail(spawn);
    walk(trail, 10, 20, false);
    expect(trail.points).toHaveLength(1);
    recordSafePoint(trail, { x: 30, y: 1, z: 0 }, true, 0.2, opts);
    expect(trail.points).toHaveLength(1);
  });

  it('不記錄靠近地圖邊緣的位置', () => {
    const trail = createSafePointTrail(spawn);
    walk(trail, 60, 79);
    const maxX = Math.max(...trail.points.map((p) => p.x));
    expect(maxX).toBeLessThanOrEqual(74);
    expect(maxX).toBeGreaterThan(70);
  });

  it('超過上限時丟棄最舊的點', () => {
    const trail = createSafePointTrail(spawn);
    walk(trail, 0, 40);
    expect(trail.points).toHaveLength(4);
    expect(trail.points.some((p) => p.z === 18)).toBe(false);
  });

  it('掉落時回到離掉落處最近的安全點，而不是出生點', () => {
    const trail = createSafePointTrail(spawn);
    walk(trail, 50, 79);
    const p = nearestSafePoint(trail, { x: 82, z: 0 }, spawn);
    expect(p.x).toBeGreaterThan(70);
    expect(p.x).toBeLessThanOrEqual(74);
  });

  it('沒有任何安全點時使用 fallback', () => {
    const trail = { points: [], groundedFor: 0 };
    expect(nearestSafePoint(trail, { x: 5, z: 5 }, spawn)).toEqual(spawn);
  });
});
