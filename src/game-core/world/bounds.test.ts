import { describe, expect, it } from 'vitest';
import { boundaryDistance, boundaryFogFactor, boundaryOutline, clampInsideBounds, PLAY_BOUNDS } from './bounds';
import { defaultSafePointOptions, isInsidePlayArea } from './safePoints';

const { halfExtent, cornerRadius } = PLAY_BOUNDS;

describe('boundaryDistance', () => {
  it('is the distance to the nearest straight edge inside the play area', () => {
    expect(boundaryDistance(0, 0)).toBeCloseTo(halfExtent);
    expect(boundaryDistance(70, 0)).toBeCloseTo(4);
    expect(boundaryDistance(0, -73)).toBeCloseTo(1);
  });

  it('is negative outside and zero on the edge', () => {
    expect(boundaryDistance(halfExtent, 5)).toBeCloseTo(0);
    expect(boundaryDistance(78, 0)).toBeCloseTo(-4);
  });

  it('follows the rounded corners', () => {
    const inner = halfExtent - cornerRadius;
    const diag = Math.SQRT1_2 * cornerRadius;
    expect(boundaryDistance(inner + diag, inner + diag)).toBeCloseTo(0);
    // 方形的尖角在圓角外面
    expect(boundaryDistance(halfExtent - 0.5, halfExtent - 0.5)).toBeLessThan(0);
  });

  it('keeps every safe point inside the play area', () => {
    const limit = defaultSafePointOptions.halfExtent - defaultSafePointOptions.edgeMargin;
    expect(limit).toBe(halfExtent);
    // 安全點範圍是方形；圓角外的角落不是安全點也沒關係，但直邊上一致
    expect(isInsidePlayArea(halfExtent, 0, defaultSafePointOptions)).toBe(true);
  });
});

describe('clampInsideBounds', () => {
  it('returns positions already inside unchanged', () => {
    expect(clampInsideBounds(10, -20)).toEqual({ x: 10, z: -20 });
  });

  it('pulls positions outside back onto the edge with margin', () => {
    for (const [x, z] of [
      [90, 3],
      [-85, -40],
      [12, 200],
      [80, 80],
      [-79, 75],
    ] as const) {
      const p = clampInsideBounds(x, z, 1);
      expect(boundaryDistance(p.x, p.z)).toBeCloseTo(1, 5);
    }
  });
});

describe('boundaryFogFactor', () => {
  it('rises from 0 far inside to 1 at the edge', () => {
    expect(boundaryFogFactor(30)).toBe(0);
    expect(boundaryFogFactor(0)).toBe(1);
    expect(boundaryFogFactor(-3)).toBe(1);
    expect(boundaryFogFactor(6)).toBeCloseTo(0.5);
  });
});

describe('boundaryOutline', () => {
  it('samples points on the boundary pushed out by offset', () => {
    const points = boundaryOutline(4, 6, 2);
    expect(points.length).toBeGreaterThan(60);
    for (const p of points) expect(boundaryDistance(p.x, p.z)).toBeCloseTo(-2, 5);
  });

  it('has no large gaps between consecutive points', () => {
    const points = boundaryOutline(4, 6);
    for (let i = 0; i < points.length; i++) {
      const a = points[i]!;
      const b = points[(i + 1) % points.length]!;
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(4.5);
    }
  });
});
