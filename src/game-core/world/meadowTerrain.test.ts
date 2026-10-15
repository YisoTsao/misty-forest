import { describe, expect, it } from 'vitest';
import { mapIdAt, MAPS } from './maps';
import { ARENA, HAMLET, MEADOW_ARRIVAL, MEADOW_ORIGIN, MEADOW_TRAILS, meadowHeight, RIDGE, TOWER, WINDMILLS } from './meadowTerrain';
import { terrainHeight, WATER_LEVEL } from './terrain';
import { getTerrainGrid } from './terrainGrid';

const O = MEADOW_ORIGIN;
const slope = (x: number, z: number) => Math.hypot(meadowHeight(x + 0.5, z) - meadowHeight(x - 0.5, z), meadowHeight(x, z + 0.5) - meadowHeight(x, z - 0.5));

describe('風語草原（任務 9F）', () => {
  it('依世界座標判斷地圖；terrainHeight 分派到草原地形', () => {
    expect(mapIdAt(O.x, O.z)).toBe('whispermeadow');
    expect(mapIdAt(O.x + 160, O.z - 160)).toBe('whispermeadow');
    expect(mapIdAt(4000, 0)).toBe('mirrorlake');
    expect(terrainHeight(O.x - 40, O.z + 20)).toBeCloseTo(meadowHeight(-40, 20));
    expect(MAPS.whispermeadow.defaultRegion).toBe('windy_hills');
  });

  it('沒有水：整張地圖都高於水面', () => {
    const grid = getTerrainGrid('whispermeadow');
    let min = Infinity;
    for (const h of grid.height) min = Math.min(min, h);
    expect(min).toBeGreaterThan(WATER_LEVEL + 0.5);
  });

  it('聚落、風車、入口是平地；台地與競技場頂面平坦', () => {
    for (const p of [HAMLET, ...WINDMILLS.map(([x, z]) => ({ x, z })), MEADOW_ARRIVAL, TOWER, ARENA]) expect(slope(p.x, p.z), `(${p.x}, ${p.z})`).toBeLessThan(0.25);
    expect(meadowHeight(TOWER.x, TOWER.z)).toBeGreaterThan(meadowHeight(HAMLET.x, HAMLET.z) + 2.5);
    expect(meadowHeight(ARENA.x, ARENA.z)).toBeCloseTo(meadowHeight(TOWER.x, TOWER.z), 0);
  });

  it('浮石山脊比平原高很多，邊緣陡峭（走不上去）', () => {
    const [x0, z0] = RIDGE.from;
    const [x1, z1] = RIDGE.to;
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    expect(meadowHeight(mx, mz)).toBeGreaterThan(11);
    let steepest = 0;
    for (let d = RIDGE.halfWidth - 3; d < RIDGE.halfWidth + 4; d += 0.5) steepest = Math.max(steepest, slope(mx, mz + d));
    expect(steepest).toBeGreaterThan(1.2);
  });

  it('小徑一路走得上去（坡度 < 45°），包括通往台地的緩坡', () => {
    for (const trail of MEADOW_TRAILS) {
      for (let i = 0; i + 1 < trail.length; i++) {
        const [ax, az] = trail[i]!;
        const [bx, bz] = trail[i + 1]!;
        const len = Math.hypot(bx - ax, bz - az);
        for (let d = 0; d <= len; d += 1) {
          const x = ax + ((bx - ax) * d) / len;
          const z = az + ((bz - az) * d) / len;
          if (Math.max(Math.abs(x), Math.abs(z)) > 140) continue;
          expect(slope(x, z), `(${x.toFixed(0)}, ${z.toFixed(0)})`).toBeLessThan(1);
        }
      }
    }
  });
});
