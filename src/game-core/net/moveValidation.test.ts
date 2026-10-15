import { describe, expect, it } from 'vitest';
import characters from '@/data/characters.json';
import weapons from '@/data/weapons.json';
import { MAPS } from '@/game-core/world/maps';
import { acceptRate, canWarp, checkMove, maxLungeIn, moveLimitsFor, zoneAt } from './moveValidation';
import { moveMessageSchema, sanitizeName } from './protocol';

const traveler = characters.find((c) => c.id === 'traveler')!;
const limits = moveLimitsFor(traveler.locomotion, maxLungeIn(weapons));
const interiors = [{ id: 'tavern', origin: [1000, 1000] as const }];

describe('移動驗證', () => {
  it('上限來自角色與武器資料：跑步加上最快的突進', () => {
    expect(maxLungeIn(weapons)).toBe(5.5);
    expect(limits.maxSpeed).toBeCloseTo((6.2 + 5.5) * 1.25);
  });

  it('跑步的距離可以，瞬移不行', () => {
    const from = { x: 0, y: 1, z: 0 };
    expect(checkMove(from, { x: 0.31, y: 1, z: 0 }, 0.05, limits).ok).toBe(true);
    expect(checkMove(from, { x: 30, y: 1, z: 0 }, 0.05, limits)).toEqual({ ok: false, reason: 'speed' });
    expect(checkMove(from, { x: 0, y: 40, z: 0 }, 0.05, limits)).toEqual({ ok: false, reason: 'vertical' });
  });

  it('停很久之後也不能一次走很遠（經過時間有上限）', () => {
    const from = { x: 0, y: 1, z: 0 };
    expect(checkMove(from, { x: 50, y: 1, z: 0 }, 60, limits).ok).toBe(false);
    expect(checkMove(from, { x: 10, y: 1, z: 0 }, 60, limits).ok).toBe(true);
  });

  it('伺服器自己判斷所在地圖與室內；可玩區外不接受', () => {
    expect(zoneAt(0, 0, interiors)).toEqual({ map: 'dawnvale', location: 'overworld' });
    const g = MAPS.glowmoss.origin;
    expect(zoneAt(g.x + 10, g.z, interiors)).toEqual({ map: 'glowmoss', location: 'overworld' });
    expect(zoneAt(1002, 1001, interiors)).toEqual({ map: 'dawnvale', location: 'tavern' });
    expect(zoneAt(400, 0, interiors)).toBeNull();
    expect(zoneAt(1000, -5000, interiors)).toBeNull();
  });

  it('瞬移與訊息頻率的限制', () => {
    expect(canWarp(null, 0, 1500)).toBe(true);
    expect(canWarp(1000, 2000, 1500)).toBe(false);
    expect(canWarp(1000, 2600, 1500)).toBe(true);
    const counter = { windowStart: 0, count: 0 };
    const accepted = Array.from({ length: 40 }, (_, i) => acceptRate(counter, 10 + i, 30)).filter(Boolean).length;
    expect(accepted).toBe(30);
    expect(acceptRate(counter, 1100, 30)).toBe(true);
  });
});

describe('訊息格式', () => {
  it('只接受有限的數字、已知的動畫，不接受多餘欄位', () => {
    const ok = { t: 1234.5, x: 1, y: 2, z: 3, yaw: 0.5, anim: 'run' };
    expect(moveMessageSchema.safeParse(ok).success).toBe(true);
    expect(moveMessageSchema.safeParse({ ...ok, x: Number.NaN }).success).toBe(false);
    expect(moveMessageSchema.safeParse({ ...ok, x: Infinity }).success).toBe(false);
    expect(moveMessageSchema.safeParse({ ...ok, anim: 'fly' }).success).toBe(false);
    expect(moveMessageSchema.safeParse({ ...ok, hp: 999 }).success).toBe(false);
    expect(moveMessageSchema.safeParse({ ...ok, x: 1e9 }).success).toBe(false);
    expect(moveMessageSchema.safeParse({ ...ok, t: -1 }).success).toBe(false);
  });

  it('顯示名稱去掉控制字元並限制長度', () => {
    expect(sanitizeName('  小旅人\n ', '旅人')).toBe('小旅人');
    expect(sanitizeName('', '旅人')).toBe('旅人');
    expect(sanitizeName(undefined, '旅人')).toBe('旅人');
    expect([...sanitizeName('一二三四五六七八九十一二三四五六七八', 'x')]).toHaveLength(16);
  });
});
