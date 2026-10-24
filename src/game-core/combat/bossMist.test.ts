import { describe, expect, it } from 'vitest';
import { activeMistSpots, bossMistRising, inBossMist, type BossMist } from './bossMist';

const mist: BossMist = { radius: 2, damage: 4, interval: 1, safeRadius: 3, spots: [[0, 0], [10, 0]] };

describe('紫霧區', () => {
  it('第二階段（血量低於門檻）或淨化中才出現', () => {
    expect(bossMistRising({ phase2Below: 0.6 }, 0.7, false)).toBe(false);
    expect(bossMistRising({ phase2Below: 0.6 }, 0.5, false)).toBe(true);
    expect(bossMistRising({ phase2Below: 0.6 }, 0.9, true)).toBe(true);
  });

  it('站在紫霧半徑內才算在紫霧裡', () => {
    expect(inBossMist(mist, [], 1.5, 0)).toBe(true);
    expect(inBossMist(mist, [], 5, 0)).toBe(false);
  });

  it('點亮的石柱驅散 safeRadius 內的紫霧，其他的還在', () => {
    expect(activeMistSpots(mist, [[2, 0]])).toEqual([[10, 0]]);
    expect(inBossMist(mist, [[2, 0]], 0, 0)).toBe(false);
    expect(inBossMist(mist, [[2, 0]], 10, 0)).toBe(true);
  });
});
