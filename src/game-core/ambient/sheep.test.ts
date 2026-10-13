import { describe, expect, it } from 'vitest';
import ambient from '@/data/ambient.json';
import { mulberry32 } from '../util/random';
import { createFlock, flockPaused, parseFlocks, SHEEP, stepFlock, type FlockDef } from './sheep';

const def: FlockDef = { id: 'test', center: [0, 0], radius: 6, count: 6, seed: 3 };
const far = { x: 500, z: 500 };

describe('羊群', () => {
  it('專案的羊群資料合法', () => {
    expect(parseFlocks(ambient.flocks).length).toBeGreaterThan(0);
  });

  it('一開始都在牧草地內；長時間漫步後仍不離開、彼此不重疊', () => {
    const flock = createFlock(def);
    const rand = mulberry32(1);
    const start = flock.map((s) => [s.x, s.z]);
    for (let i = 0; i < 2000; i++) stepFlock(flock, def, far, 0.05, rand);
    for (const s of flock) expect(Math.hypot(s.x, s.z)).toBeLessThanOrEqual(def.radius + 1e-6);
    for (let i = 0; i < flock.length; i++)
      for (let j = i + 1; j < flock.length; j++) expect(Math.hypot(flock[i]!.x - flock[j]!.x, flock[i]!.z - flock[j]!.z)).toBeGreaterThan(SHEEP.spacing * 0.8);
    // 有羊走動過
    expect(flock.some((s, i) => Math.hypot(s.x - start[i]![0]!, s.z - start[i]![1]!) > 0.5)).toBe(true);
    // 休息、吃草、漫步都會出現
    const modes = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      stepFlock(flock, def, far, 0.05, rand);
      flock.forEach((s) => modes.add(s.mode));
    }
    expect([...modes].sort()).toEqual(['graze', 'rest', 'walk']);
  });

  it('玩家靠近時走開', () => {
    const flock = createFlock({ ...def, count: 1 });
    const s = flock[0]!;
    const player = { x: s.x + 1, z: s.z };
    const before = Math.hypot(s.x - player.x, s.z - player.z);
    const rand = mulberry32(2);
    stepFlock(flock, def, player, 0.05, rand);
    expect(s.mode).toBe('flee');
    for (let i = 0; i < 40; i++) stepFlock(flock, def, player, 0.05, rand);
    expect(Math.hypot(s.x - player.x, s.z - player.z)).toBeGreaterThan(before + 1);
  });

  it('玩家遠離時整群暫停', () => {
    expect(flockPaused(def, 10, 0)).toBe(false);
    expect(flockPaused(def, SHEEP.pauseDistance + def.radius + 1, 0)).toBe(true);
  });
});
