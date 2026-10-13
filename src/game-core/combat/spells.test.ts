import { describe, expect, it } from 'vitest';
import spellsData from '@/data/spells.json';
import { isInBlast, MAX_MP, meteorPlan, parseSpells, pickSeekTarget, regenMp, spreadYaws, steerYaw } from './spells';
import { mulberry32 } from '../util/random';

const spells = parseSpells(spellsData);

describe('spells data', () => {
  it('Q 是星光衝擊、F 是星屑飛彈、C 是流星雨', () => {
    const byAction = new Map([...spells.values()].map((s) => [s.action, s.id]));
    expect(byAction.get('skill')).toBe('spell_starlight_burst');
    expect(byAction.get('spell2')).toBe('spell_star_bolt');
    expect(byAction.get('spell3')).toBe('spell_meteor_shower');
  });

  it('拒絕重複的按鍵動作與缺少彈體設定的 bolt', () => {
    const dup = structuredClone(spellsData);
    dup[1]!.action = 'skill';
    expect(() => parseSpells(dup)).toThrow(/同一個按鍵動作/);
    const noProjectile = structuredClone(spellsData) as Record<string, unknown>[];
    delete noProjectile[1]!.projectiles;
    expect(() => parseSpells(noProjectile)).toThrow(/缺少 projectiles/);
  });

  it('每個法術的消耗都不超過上限', () => {
    for (const s of spells.values()) expect(s.mpCost).toBeLessThanOrEqual(MAX_MP);
  });
});

describe('mp', () => {
  it('回復到上限為止', () => {
    expect(regenMp(10, 1)).toBeCloseTo(16);
    expect(regenMp(98, 5)).toBe(MAX_MP);
    expect(regenMp(50, -1)).toBe(50);
  });
});

describe('homing', () => {
  const enemies = [
    { id: 'a', x: 0, z: 6 },
    { id: 'b', x: 2, z: 3 },
    { id: 'c', x: 0, z: -3 },
  ];

  it('picks the nearest enemy inside the seek cone', () => {
    expect(pickSeekTarget({ x: 0, z: 0 }, 0, enemies, 80, 16)?.id).toBe('b'); // b 在 33.7°
    expect(pickSeekTarget({ x: 0, z: 0 }, 0, enemies, 20, 16)?.id).toBe('a');
  });

  it('returns null when nothing is in front', () => {
    expect(pickSeekTarget({ x: 0, z: 0 }, Math.PI / 2, enemies, 30, 16)).toBeNull();
  });

  it('turns toward the target at most turnRate per second', () => {
    const yaw = steerYaw(0, { x: 0, z: 0 }, { x: 10, z: 0 }, 2, 0.1);
    expect(yaw).toBeCloseTo(0.2);
    expect(steerYaw(0, { x: 0, z: 0 }, { x: 0.01, z: 10 }, 2, 0.1)).toBeCloseTo(0.001, 2);
  });

  it('spreads projectiles evenly around the facing direction', () => {
    const yaws = spreadYaws(0, 3, 20);
    expect(yaws[1]).toBeCloseTo(0);
    expect(yaws[2]! - yaws[0]!).toBeCloseTo((20 * Math.PI) / 180);
    expect(spreadYaws(1, 1, 30)).toEqual([1]);
  });
});

describe('blast', () => {
  it('includes the target body radius', () => {
    expect(isInBlast({ x: 0, z: 0 }, 3.6, { x: 4, z: 0, radius: 0.5 })).toBe(true);
    expect(isInBlast({ x: 0, z: 0 }, 3.6, { x: 4.2, z: 0, radius: 0.5 })).toBe(false);
  });
});

describe('meteor shower plan', () => {
  const meteor = spells.get('spell_meteor_shower')!;

  it('C 是流星雨：大範圍、長冷卻、需要不少星光', () => {
    expect(meteor.action).toBe('spell3');
    expect(meteor.mpCost).toBeGreaterThanOrEqual(50);
    expect(meteor.cooldown).toBeGreaterThanOrEqual(20);
  });

  it('drops every meteor inside the area, the last one at the centre and a little later', () => {
    const plan = meteorPlan(meteor, { x: 10, z: -5 }, mulberry32(3));
    expect(plan).toHaveLength(meteor.meteor!.count);
    for (const p of plan) expect(Math.hypot(p.x - 10, p.z + 5)).toBeLessThanOrEqual(meteor.radius * 0.75 + 1e-9);
    const last = plan[plan.length - 1]!;
    expect(last.final).toBe(true);
    expect(last).toMatchObject({ x: 10, z: -5 });
    expect(last.delay).toBeGreaterThan(plan[plan.length - 2]!.delay + meteor.meteor!.interval * 0.99);
    expect(plan.filter((p) => p.final)).toHaveLength(1);
  });

  it('delays increase with the interval', () => {
    const plan = meteorPlan(meteor, { x: 0, z: 0 }, mulberry32(1));
    for (let i = 1; i < plan.length - 1; i++) expect(plan[i]!.delay - plan[i - 1]!.delay).toBeCloseTo(meteor.meteor!.interval);
  });

  it('returns nothing for non-meteor spells', () => {
    expect(meteorPlan(spells.get('spell_star_bolt')!, { x: 0, z: 0 }, Math.random)).toEqual([]);
  });
});
