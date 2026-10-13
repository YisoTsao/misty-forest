import { parseBuildables, type BuildableCatalog } from '../build/build';
import { parseCombatData, type CombatData } from '../combat/combat';
import { parseCompanion, type CompanionDef } from '../companion/companion';
import { conditionItemIds, conditionQuestIds } from '../dialogue/conditions';
import { parseDialogues, type DialogueDef } from '../dialogue/dialogue';
import { parseItemData, type ItemCatalog, type LootTables } from '../items/items';
import { parseNpcs, type NpcDef } from '../npc/npc';
import { parseQuests, type QuestCatalog } from '../quest/quest';
import { parseInteriors, type InteriorDef } from './interiors';
import { parseRegions, type RegionDef } from './regions';
import { parseWorldData, WorldDataError, type WorldData } from './worldData';

/** 遊戲啟動時載入的全部靜態資料：世界物件 + 物品與掉落表。 */
export type GameData = WorldData & {
  items: ItemCatalog;
  lootTables: LootTables;
  regions: readonly RegionDef[];
  dialogues: ReadonlyMap<string, DialogueDef>;
  npcs: readonly NpcDef[];
  quests: QuestCatalog;
  combat: CombatData;
  companion: CompanionDef;
  buildables: BuildableCatalog;
  interiors: ReadonlyMap<string, InteriorDef>;
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
  quests: unknown;
  enemies: unknown;
  spawners: unknown;
  companion: unknown;
  buildables: unknown;
  interiors: unknown;
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
  let combat: CombatData;
  try {
    combat = parseCombatData(raw.enemies, raw.spawners, new Set(lootTables.keys()));
  } catch (err) {
    throw new WorldDataError(`enemies / spawners 資料錯誤：${err instanceof Error ? err.message : String(err)}`);
  }
  let quests: QuestCatalog;
  try {
    quests = parseQuests(raw.quests, { items: new Set(items.keys()), npcs: new Set(npcs.map((n) => n.id)), enemies: new Set(combat.enemies.keys()) });
  } catch (err) {
    throw new WorldDataError(`quests 資料錯誤：${err instanceof Error ? err.message : String(err)}`);
  }
  let companion: CompanionDef;
  try {
    companion = parseCompanion(raw.companion);
  } catch (err) {
    throw new WorldDataError(`companion 資料錯誤：${err instanceof Error ? err.message : String(err)}`);
  }
  conditions.push(...companion.hints.map((h) => h.when));
  // 對話條件與效果參照的任務必須存在
  const effectQuests = [...dialogues.values()].flatMap((d) =>
    Object.values(d.nodes).flatMap((n) => (n.options ?? []).flatMap((o) => (o.effects ?? []).flatMap((e) => ('quest' in e ? [e.quest] : [])))),
  );
  for (const questId of [...conditions.flatMap(conditionQuestIds), ...effectQuests]) {
    if (!quests.has(questId)) throw new WorldDataError(`對話參照不存在的任務：${questId}`);
  }
  let buildables: BuildableCatalog;
  try {
    buildables = parseBuildables(raw.buildables, { prefabs: new Set(world.prefabs.keys()), items: new Set(items.keys()) });
  } catch (err) {
    throw new WorldDataError(`buildables 資料錯誤：${err instanceof Error ? err.message : String(err)}`);
  }
  let interiors: Map<string, InteriorDef>;
  try {
    interiors = parseInteriors(raw.interiors, new Set(world.placements.map((p) => p.id)));
  } catch (err) {
    throw new WorldDataError(`interiors 資料錯誤：${err instanceof Error ? err.message : String(err)}`);
  }
  for (const prefab of world.prefabs.values()) {
    const to = prefab.enter?.to;
    if (to && to !== 'overworld' && !interiors.has(to)) throw new WorldDataError(`prefab ${prefab.id} 的出入口通往不存在的室內：${to}`);
  }
  return { ...world, items, lootTables, regions, dialogues, npcs, quests, combat, companion, buildables, interiors };
}
