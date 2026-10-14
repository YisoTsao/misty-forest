import { describe, expect, it } from 'vitest';
import { mapIdAt, MAPS } from './maps';
import {
  LAKE_CAMP,
  MIRROR_LAKE,
  MIRROR_RUINS,
  MIRROR_TEMPLE,
  MIRRORLAKE_ARRIVAL,
  MIRRORLAKE_ORIGIN,
  MIRRORLAKE_TRAILS,
  mirrorlakeHeight,
  REED_ISLE,
  SHALLOW_PATH,
  shallowPathDistance,
} from './mirrorlakeTerrain';
import { terrainHeight, WATER_LEVEL } from './terrain';
import { getTerrainGrid } from './terrainGrid';

const O = MIRRORLAKE_ORIGIN;
/** 落水的深度（與 Player 的 DROWN_DEPTH 相同） */
const DROWN_DEPTH = 0.6;

describe('澄鏡湖（任務 9A）', () => {
  it('依世界座標判斷地圖；terrainHeight 分派到湖岸地形', () => {
    expect(mapIdAt(O.x, O.z)).toBe('mirrorlake');
    expect(mapIdAt(O.x - 160, O.z + 160)).toBe('mirrorlake');
    expect(mapIdAt(2000, 0)).toBe('glowmoss');
    expect(terrainHeight(O.x + 20, O.z - 30)).toBeCloseTo(mirrorlakeHeight(20, -30));
    expect(MAPS.mirrorlake.defaultRegion).toBe('lake_shore');
  });

  it('湖心夠深（會落水）、岸上高於水面', () => {
    expect(mirrorlakeHeight(MIRROR_LAKE.x - 20, MIRROR_LAKE.z + 30)).toBeLessThan(WATER_LEVEL - 2.5);
    expect(mirrorlakeHeight(MIRRORLAKE_ARRIVAL.x, MIRRORLAKE_ARRIVAL.z)).toBeGreaterThan(WATER_LEVEL + 1);
    expect(mirrorlakeHeight(LAKE_CAMP.x, LAKE_CAMP.z)).toBeGreaterThan(WATER_LEVEL + 0.8);
  });

  it('淺水石徑：從營地一路涉水到神殿島，全程在水裡但不會落水', () => {
    let wet = 0;
    for (let i = 0; i + 1 < SHALLOW_PATH.length; i++) {
      const [ax, az] = SHALLOW_PATH[i]!;
      const [bx, bz] = SHALLOW_PATH[i + 1]!;
      for (let t = 0; t <= 1; t += 0.05) {
        const h = mirrorlakeHeight(ax + (bx - ax) * t, az + (bz - az) * t);
        expect(h).toBeGreaterThan(WATER_LEVEL - DROWN_DEPTH + 0.2);
        if (h < WATER_LEVEL) wet++;
      }
    }
    expect(wet).toBeGreaterThan(40);
    // 石徑兩側幾公尺外就是深水
    expect(shallowPathDistance(-42, 26)).toBeGreaterThan(8);
    expect(mirrorlakeHeight(-42, 26)).toBeLessThan(WATER_LEVEL - DROWN_DEPTH);
  });

  it('神殿島與蘆葦島高出水面、頂面平坦；遺構一半在淺水裡', () => {
    for (const isle of [MIRROR_TEMPLE, REED_ISLE]) {
      const h = mirrorlakeHeight(isle.x, isle.z);
      expect(h).toBeGreaterThan(WATER_LEVEL + 0.5);
      expect(Math.abs(mirrorlakeHeight(isle.x + 5, isle.z) - h)).toBeLessThan(0.3);
    }
    expect(mirrorlakeHeight(MIRROR_RUINS.x, MIRROR_RUINS.z + 6)).toBeGreaterThan(WATER_LEVEL);
    const shallow = mirrorlakeHeight(MIRROR_RUINS.x, MIRROR_RUINS.z - 6);
    expect(shallow).toBeLessThan(WATER_LEVEL);
    expect(shallow).toBeGreaterThan(WATER_LEVEL - DROWN_DEPTH);
  });

  it('岸上的小徑不在水裡、坡度可以走', () => {
    for (const trail of MIRRORLAKE_TRAILS) {
      for (let i = 0; i + 1 < trail.length; i++) {
        const [ax, az] = trail[i]!;
        const [bx, bz] = trail[i + 1]!;
        const len = Math.hypot(bx - ax, bz - az);
        for (let d = 0; d <= len; d += 1) {
          const x = ax + ((bx - ax) * d) / len;
          const z = az + ((bz - az) * d) / len;
          if (Math.max(Math.abs(x), Math.abs(z)) > 140) continue;
          expect(mirrorlakeHeight(x, z), `(${x.toFixed(0)}, ${z.toFixed(0)})`).toBeGreaterThan(WATER_LEVEL + 0.2);
          const slope = Math.hypot(mirrorlakeHeight(x + 0.5, z) - mirrorlakeHeight(x - 0.5, z), mirrorlakeHeight(x, z + 0.5) - mirrorlakeHeight(x, z - 0.5));
          expect(slope).toBeLessThan(1);
        }
      }
    }
  });

  it('取樣格以地圖原點為中心', () => {
    const grid = getTerrainGrid('mirrorlake');
    expect(grid.originX).toBe(O.x);
    const mid = (grid.size - 1) / 2;
    expect(grid.height[mid * grid.size + mid]).toBeCloseTo(mirrorlakeHeight(0, 0));
  });
});
