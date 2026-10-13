import { conditionItemIds } from '../dialogue/conditions';
import { parseDialogues, type DialogueDef } from '../dialogue/dialogue';
import { parseItemData, type ItemCatalog, type LootTables } from '../items/items';
import { parseNpcs, type NpcDef } from '../npc/npc';
import { parseRegions, type RegionDef } from './regions';
import { parseWorldData, WorldDataError, type WorldData } from './worldData';

/** 遊戲啟動時載入的全部靜態資料：世界物件 + 物品與掉落表。 */
export type GameData = WorldData & {
  items: ItemCatalog;
  lootTables: LootTables;
  regions: readonly RegionDef[];
  dialogues: ReadonlyMap<string, DialogueDef>;
  npcs: readonly NpcDef[];
};

/** 驗證全部資料並檢查跨檔參照（prefab 的掉落表必須存在）。失敗時拋錯，不得默默略過。 */
export function parseGameData(raw: {
  prefabs: unknown;
  placements: unknown;
  items: unknown;
  lootTables: unknown;
  regions: unknown;
  dialogues: unknown;
  npcs: unknown;
}): GameData {
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
  const dialogues = parseDialogues(raw.dialogues);
  let npcs: NpcDef[];
  try {
    npcs = parseNpcs(raw.npcs, new Set(dialogues.keys()));
  } catch (err) {
    throw new WorldDataError(`npcs 資料錯誤：${err instanceof Error ? err.message : String(err)}`);
  }
  // 條件中的物品必須存在
  const conditions = [
    ...[...dialogues.values()].flatMap((d) => Object.values(d.nodes).flatMap((n) => (n.options ?? []).map((o) => o.when))),
    ...npcs.flatMap((n) => n.talk.map((t) => t.when)),
  ];
  for (const itemId of conditions.flatMap(conditionItemIds)) {
    if (!items.has(itemId)) throw new WorldDataError(`對話條件參照不存在的物品：${itemId}`);
  }
  return { ...world, items, lootTables, regions, dialogues, npcs };
}
