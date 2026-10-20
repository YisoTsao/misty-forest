// 舊版螢苔祕林的測試樣本（任務 12A，T-185）：苔咚、霧孢飛蛾、根鬚甲蟲與苔冠空地的水槽已從遊戲資料移除，
// 但頭目 AI、戰場物件與護盾、盤旋與縮殼行為仍是共用規則（根噬者與之後的怪物會用到），測試改用這份樣本驗證。
import { parseCombatData, type CombatData } from '../combat/combat';
import { lootTableSchema, type LootTable } from '../items/items';
import { placementSchema, prefabSchema, type Placement, type Prefab } from '../world/types';
import legacy from './legacyForest.json';

export const LEGACY_BOSS = 'boss_moss_thump';

const lootTables: LootTable[] = legacy.lootTables.map((t) => lootTableSchema.parse(t));

/** 樣本的敵人與生成點（單獨驗證，掉落表只參照樣本自己的） */
export const legacyCombat: CombatData = parseCombatData(legacy.enemies, legacy.spawners, new Set(lootTables.map((t) => t.id)));

type DataWithLegacy = {
  prefabs: ReadonlyMap<string, Prefab>;
  placements: readonly Placement[];
  lootTables: ReadonlyMap<string, LootTable>;
  combat: CombatData;
};

/** 在實際遊戲資料上加入樣本：敵人、頭目的生成點、掉落表、水槽的 prefab 與 placement */
export function withLegacyForest<T extends DataWithLegacy>(data: T): T {
  const prefabs = legacy.prefabs.map((p) => prefabSchema.parse(p));
  const placements = legacy.placements.map((p) => placementSchema.parse(p));
  return {
    ...data,
    prefabs: new Map([...data.prefabs, ...prefabs.map((p) => [p.id, p] as const)]),
    placements: [...data.placements, ...placements],
    lootTables: new Map([...data.lootTables, ...lootTables.map((t) => [t.id, t] as const)]),
    combat: { enemies: new Map([...data.combat.enemies, ...legacyCombat.enemies]), spawners: [...data.combat.spawners, ...legacyCombat.spawners] },
  };
}
