// 第二章 M-02 菌帽小妖（規格 §6.2）：成群接近、出手後跑開（skirmish），掉落菌帽與柔韌樹皮；生成在 B 花園與 D 聚落外圍。
import { describe, expect, it } from 'vitest';
import enemiesData from '@/data/enemies.json';
import lootData from '@/data/lootTables.json';
import regionsData from '@/data/regions.json';
import spawnersData from '@/data/spawners.json';
import { parseCombatData } from './combat';
import { applyHitReaction, createEnemyAi, stepEnemyAi } from './enemyAi';
import { parseRegions, regionAt } from '../world/regions';

const data = parseCombatData(enemiesData, spawnersData, new Set(lootData.map((t) => t.id)));
const regions = parseRegions(regionsData);
const imp = data.enemies.get('mob_cap_imp')!;
const home = { x: 0, z: 0, radius: 5 };
const step = (ai: ReturnType<typeof createEnemyAi>, player: { x: number; z: number }, sec: number) => {
  let strikes = 0;
  for (let t = 0; t < sec; t += 0.05) if (stepEnemyAi(ai, imp, { dt: 0.05, player: { ...player, alive: true }, home, random: () => 0.5 }).strike) strikes++;
  return strikes;
};

describe('菌帽小妖', () => {
  it('出手後跑開一段時間，拉開距離，再回頭追擊', () => {
    const ai = createEnemyAi(0, 0);
    const player = { x: 1.2, z: 0 };
    ai.state = 'chase';
    let strikes = 0;
    for (let i = 0; i < 40 && strikes === 0; i++) strikes += step(ai, player, 0.05);
    expect(strikes).toBe(1);
    expect(ai.state).toBe('retreat');
    const before = Math.hypot(ai.x - player.x, ai.z - player.z);
    step(ai, player, 0.8);
    expect(ai.state).toBe('retreat');
    expect(Math.hypot(ai.x - player.x, ai.z - player.z)).toBeGreaterThan(before + 2);
    step(ai, player, 0.6);
    expect(ai.state).toBe('chase');
  });

  it('跑開中被打不會回頭', () => {
    const ai = createEnemyAi(0, 0);
    ai.state = 'retreat';
    applyHitReaction(ai, { x: 1, z: 0 }, 3, imp);
    expect(ai.state).toBe('retreat');
  });

  it('掉落菌帽與柔韌樹皮', () => {
    expect(lootData.find((t) => t.id === imp.lootTableId)!.drops.map((d) => d.itemId)).toEqual(['fungus_cap', 'tough_bark']);
  });

  it('生成點在螢苔花園與蘑菇居民聚落，一次多隻', () => {
    for (const id of ['glowmoss_imps_garden', 'glowmoss_imps_village']) {
      const s = spawnersData.find((x) => x.id === id)!;
      expect(s.enemy).toBe('mob_cap_imp');
      expect(regionAt(regions, s.center[0]!, s.center[1]!)).toBe(s.regionId);
      expect(s.budget.dense).toBeGreaterThanOrEqual(3);
    }
  });
});
