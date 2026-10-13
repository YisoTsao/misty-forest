import { parseItemData, type ItemCatalog, type LootTables } from '../items/items';
import { parseRegions, type RegionDef } from './regions';
import { parseWorldData, WorldDataError, type WorldData } from './worldData';

/** 遊戲啟動時載入的全部靜態資料：世界物件 + 物品與掉落表。 */
export type GameData = WorldData & { items: ItemCatalog; lootTables: LootTables; regions: readonly RegionDef[] };

/** 驗證全部資料並檢查跨檔參照（prefab 的掉落表必須存在）。失敗時拋錯，不得默默略過。 */
export function parseGameData(raw: { prefabs: unknown; placements: unknown; items: unknown; lootTables: unknown; regions: unknown }): GameData {
  const world = parseWorldData(raw.prefabs, raw.placements);
  const { items, lootTables } = parseItemData(raw.items, raw.lootTables);
  for (const prefab of world.prefabs.values()) {
    for (const tableId of [prefab.harvest?.lootTableId, prefab.contents?.lootTableId]) {
      if (tableId !== undefined && !lootTables.has(tableId)) {
        throw new WorldDataError(`prefab ${prefab.id} 參照不存在的掉落表：${tableId}`);
      }
    }
  }
  let regions: RegionDef[];
  try {
    regions = parseRegions(raw.regions);
  } catch (err) {
    throw new WorldDataError(`regions 資料格式錯誤：${err instanceof Error ? err.message : String(err)}`);
  }
  return { ...world, items, lootTables, regions };
}
