// 第二章 Phase 3：迷霧深層的怪物（規格 §6.2 M-03、M-04）——森林狼盤旋後衝撞，幻霧螢靈遠距離攻擊後瞬移；生成點在深層。
import { describe, expect, it } from 'vitest';
import enemiesData from '@/data/enemies.json';
import lootData from '@/data/lootTables.json';
import regionsData from '@/data/regions.json';
import spawnersData from '@/data/spawners.json';
import { parseCombatData } from './combat';
import { parseRegions, regionAt } from '../world/regions';

const data = parseCombatData(enemiesData, spawnersData, new Set(lootData.map((t) => t.id)));
const regions = parseRegions(regionsData);

describe('迷霧深層的怪物', () => {
  it('森林狼：盤旋後衝撞（orbit ＋ lunge），掉落霧紋獸牙與厚實獸皮', () => {
    const wolf = data.enemies.get('mob_mist_wolf')!;
    expect(wolf.behavior?.kind).toBe('orbit');
    expect(wolf.lunge).toBeGreaterThan(0);
    const drops = lootData.find((t) => t.id === 'mob_mist_wolf_drop')!.drops.map((d) => d.itemId);
    expect(drops).toEqual(['mist_fang', 'thick_pelt']);
  });

  it('幻霧螢靈：遠距離攻擊後瞬移拉開距離', () => {
    const wisp = data.enemies.get('mob_fog_wisp')!;
    expect(wisp.behavior?.kind).toBe('spit');
    expect(wisp.behavior?.kind === 'spit' && wisp.behavior.retreat).toBeGreaterThan(0);
  });

  it('枯根守衛（精英）：縮殼擋傷，掉落守衛木核（守林者系列裝備的材料）', () => {
    const guard = data.enemies.get('mob_root_guard')!;
    expect(guard.behavior?.kind).toBe('shell');
    expect(guard.maxHp).toBeGreaterThan(data.enemies.get('mob_mist_wolf')!.maxHp * 3);
    expect(lootData.find((t) => t.id === 'mob_root_guard_drop')!.drops[0]!.itemId).toBe('guardian_heartwood');
  });

  it('生成點都在迷霧深層，中心點落在深層區域內', () => {
    for (const id of ['deep_wolves', 'deep_wisps', 'deep_guard']) {
      const s = spawnersData.find((x) => x.id === id)!;
      expect(s.regionId).toBe('deep_mist');
      expect(regionAt(regions, s.center[0]!, s.center[1]!)).toBe('deep_mist');
    }
  });
});
