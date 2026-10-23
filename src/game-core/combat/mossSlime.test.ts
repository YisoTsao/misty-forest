// 任務 12D：螢苔史萊姆（規格 M-01、Bible §6.2）——跳撞（lunge）、黏液噴射（spit）、擊破後分裂成小史萊姆；
// 生成點在 A、B 區；掉落螢苔凝膠與微光孢子。
import { describe, expect, it } from 'vitest';
import enemiesData from '@/data/enemies.json';
import itemsData from '@/data/items.json';
import lootData from '@/data/lootTables.json';
import spawnersData from '@/data/spawners.json';
import { applyEvents, handleCommand, initialGameState, type GameState } from '../authority/rules';
import { parseItemData } from '../items/items';
import { testContext } from '../testing/fixtures';
import { parseRegions, regionAt } from '../world/regions';
import regionsData from '@/data/regions.json';
import { parseCombatData } from './combat';
import { createEnemyAi, stepEnemyAi, type EnemyAi } from './enemyAi';

const data = parseCombatData(enemiesData, spawnersData, new Set(lootData.map((t) => t.id)));
const slime = data.enemies.get('mob_moss_slime')!;
const small = data.enemies.get('mob_moss_slime_small')!;
const itemData = parseItemData(itemsData, lootData);
const ctx = { ...testContext(), combat: data, items: itemData.items, lootTables: itemData.lootTables };
const attack = 'sword_slash_diag';
const regions = parseRegions(regionsData);

function withEnemy(kind: string, hp: number, spawner: string): GameState {
  return { ...initialGameState(), enemies: new Map([['e1', { id: 'e1', kind, spawner, hp }]]) };
}

describe('螢苔史萊姆 mob_moss_slime', () => {
  it('跳撞、黏液噴射與分裂都是資料設定（沿用既有的 lunge / spit / splitInto）', () => {
    expect(slime.lunge).toBeGreaterThan(0);
    expect(slime.behavior?.kind).toBe('spit');
    expect(slime.splitInto).toEqual({ enemy: 'mob_moss_slime_small', count: 2 });
    expect(small.splitInto).toBeUndefined();
  });

  it('生成點在 A（迷霧入口）與 B（螢苔花園），中心點落在各自的區域內', () => {
    const spawners = spawnersData.filter((s) => s.enemy === 'mob_moss_slime');
    expect(spawners.map((s) => s.regionId).sort()).toEqual(['glow_garden', 'mist_gate']);
    for (const s of spawners) {
      expect(regionAt(regions, s.center[0]!, s.center[1]!)).toBe(s.regionId);
    }
  });

  it('跳撞：前搖結束出手時往面向的方向衝出（擊退速度不為零）', () => {
    const ai: EnemyAi = { ...createEnemyAi(0, 0), state: 'attack', timer: slime.attackWindup, yaw: 0 };
    const out = stepEnemyAi(ai, slime, { dt: 0.05, player: { x: 0, z: 1.2, alive: true }, home: { x: 0, z: 0, radius: 5 }, random: () => 0.5 });
    expect(out.strike).toBe(true);
    expect(Math.hypot(ai.knockback.x, ai.knockback.z)).toBeGreaterThan(0);
  });

  it('黏液噴射：距離 2.5–6 m、冷卻好了就吐泥團', () => {
    const ai = createEnemyAi(0, 0);
    ai.state = 'chase';
    const out = stepEnemyAi(ai, slime, { dt: 0.05, player: { x: 0, z: 4, alive: true }, home: { x: 0, z: 0, radius: 5 }, random: () => 0.5 });
    expect(ai.state).toBe('spit');
    expect(out.strike).toBe(false);
  });

  it('擊破時分裂成兩隻小史萊姆（同一個生成點，小的不再分裂）', () => {
    const events = handleCommand(withEnemy('mob_moss_slime', 1, 'glowmoss_slimes_a'), { type: 'AttackEnemy', enemyId: 'e1', attack }, ctx);
    const spawned = events.filter((e) => e.type === 'EnemySpawned');
    expect(spawned.map((e) => e.type === 'EnemySpawned' && e.kind)).toEqual(['mob_moss_slime_small', 'mob_moss_slime_small']);
    expect(spawned.every((e) => e.type === 'EnemySpawned' && e.spawner === 'glowmoss_slimes_a')).toBe(true);
    const after = applyEvents(withEnemy('mob_moss_slime', 1, 'glowmoss_slimes_a'), events, ctx);
    expect([...after.enemies.keys()].sort()).toEqual(['e1~1', 'e1~2']);
    const again = handleCommand(after, { type: 'AttackEnemy', enemyId: 'e1~1', attack }, ctx);
    expect(again.some((e) => e.type === 'EnemySpawned')).toBe(false);
  });

  it('掉落：擊破有機會得到螢苔凝膠與微光孢子', () => {
    const drops = lootData.find((t) => t.id === 'mob_moss_slime_drop')!.drops.map((d) => d.itemId);
    expect(drops).toEqual(['moss_gel', 'glow_spore']);
    expect(itemData.items.has('glow_spore')).toBe(true);
  });
});
