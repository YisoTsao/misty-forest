import { parseBuildables, type BuildableCatalog } from '../build/build';
import { parseCombatData, type CombatData } from '../combat/combat';
import { parseWeapons, type WeaponCatalog } from '../combat/weapons';
import { parseSpells, type SpellCatalog } from '../combat/spells';
import { parseLandmarks, type Landmark } from '../map/markers';
import { parseCompanion, type CompanionDef } from '../companion/companion';
import { conditionItemIds, conditionQuestIds } from '../dialogue/conditions';
import { parseDialogues, type DialogueDef } from '../dialogue/dialogue';
import { parseItemData, type ItemCatalog, type LootTables } from '../items/items';
import { parseNpcs, type NpcDef } from '../npc/npc';
import { parseQuests, type QuestCatalog } from '../quest/quest';
import { parseFlocks, type FlockDef } from '../ambient/sheep';
import { parseInteriors, type InteriorDef } from './interiors';
import { mapIdAt, mapIds } from './maps';
import { parseRegions, type RegionDef } from './regions';
import { parseWaterways, type WaterwayDef } from './waterway';
import { parseShops, type ShopDef } from '../shop/shop';
import { parseCraftData, type CraftData } from '../craft/craft';
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
  flocks: readonly FlockDef[];
  /** 近戰武器與招式（GAME_DESIGN 5.3） */
  weapons: WeaponCatalog;
  /** 魔法（GAME_DESIGN 5.4） */
  spells: SpellCatalog;
  /** 世界地圖的地標（任務 7B） */
  landmarks: readonly Landmark[];
  /** 水道謎題（任務 8C） */
  waterways: readonly WaterwayDef[];
  /** 商店（任務 7H） */
  shops: ReadonlyMap<string, ShopDef>;
  /** 工作台與配方（任務 7J） */
  crafting: CraftData;
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
  ambient: unknown;
  weapons: unknown;
  spells: unknown;
  /** 省略時沒有地標（測試用的最小資料） */
  landmarks?: unknown;
  /** 省略時沒有水道（測試用的最小資料） */
  waterways?: unknown;
  shops?: unknown;
  crafting?: unknown;
}): GameData {
  const world = parseWorldData(raw.prefabs, raw.placements);
  const { items, lootTables } = parseItemData(raw.items, raw.lootTables);
  for (const prefab of world.prefabs.values()) {
    for (const tableId of [prefab.harvest?.lootTableId, prefab.contents?.lootTableId, prefab.activate?.lootTableId]) {
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
    ...npcs.flatMap((n) => [...n.talk.map((t) => t.when), n.visible]),
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
    quests = parseQuests(raw.quests, {
      items: new Set(items.keys()),
      npcs: new Set(npcs.map((n) => n.id)),
      enemies: new Set(combat.enemies.keys()),
      placements: new Set(world.placements.map((p) => p.id)),
    });
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
  const placementsById = new Map(world.placements.map((p) => [p.id, p]));
  for (const prefab of world.prefabs.values()) {
    for (const need of [prefab.harvest?.quest, prefab.repair?.quest, prefab.activate?.quest]) {
      if (need !== undefined && !quests.has(need)) throw new WorldDataError(`prefab ${prefab.id} 參照不存在的任務：${need}`);
    }
    const enter = prefab.enter;
    if (!enter) continue;
    if ((mapIds as readonly string[]).includes(enter.to)) {
      // 地圖出入口：抵達點必須存在且在目的地圖內；條件中的任務必須存在
      const arrive = enter.arriveAt === undefined ? undefined : placementsById.get(enter.arriveAt);
      if (!arrive) throw new WorldDataError(`prefab ${prefab.id} 的地圖出入口缺少抵達點：${enter.arriveAt ?? '（未指定）'}`);
      if (mapIdAt(arrive.position[0], arrive.position[2]) !== enter.to) throw new WorldDataError(`prefab ${prefab.id} 的抵達點不在地圖 ${enter.to} 內`);
      const need = enter.requires?.questCompleted;
      if (need !== undefined && !quests.has(need)) throw new WorldDataError(`prefab ${prefab.id} 的通過條件參照不存在的任務：${need}`);
      continue;
    }
    if (enter.to !== 'overworld' && !interiors.has(enter.to)) throw new WorldDataError(`prefab ${prefab.id} 的出入口通往不存在的室內：${enter.to}`);
  }
  let flocks: FlockDef[];
  try {
    flocks = parseFlocks((raw.ambient as { flocks?: unknown } | null)?.flocks);
  } catch (err) {
    throw new WorldDataError(`ambient 資料錯誤：${err instanceof Error ? err.message : String(err)}`);
  }
  let weapons: WeaponCatalog;
  try {
    weapons = parseWeapons(raw.weapons);
  } catch (err) {
    throw new WorldDataError(`weapons 資料錯誤：${err instanceof Error ? err.message : String(err)}`);
  }
  let spells: SpellCatalog;
  try {
    spells = parseSpells(raw.spells);
  } catch (err) {
    throw new WorldDataError(`spells 資料錯誤：${err instanceof Error ? err.message : String(err)}`);
  }
  let landmarks: Landmark[];
  try {
    landmarks = parseLandmarks(raw.landmarks ?? []);
  } catch (err) {
    throw new WorldDataError(`landmarks 資料錯誤：${err instanceof Error ? err.message : String(err)}`);
  }
  for (const l of landmarks) {
    if (l.requires && !quests.has(l.requires.questCompleted)) throw new WorldDataError(`地標 ${l.id} 參照不存在的任務：${l.requires.questCompleted}`);
  }
  // 頭目的開戰條件參照的任務必須存在
  for (const e of combat.enemies.values()) {
    for (const questId of Object.values(e.boss?.requires ?? {})) {
      if (questId && !quests.has(questId)) throw new WorldDataError(`頭目 ${e.id} 的開戰條件參照不存在的任務：${questId}`);
    }
  }
  let waterways: WaterwayDef[];
  try {
    waterways = parseWaterways(raw.waterways ?? [], new Set(world.placements.map((p) => p.id)));
  } catch (err) {
    throw new WorldDataError(`waterways 資料錯誤：${err instanceof Error ? err.message : String(err)}`);
  }
  for (const w of waterways) {
    const wheel = world.prefabs.get(placementsById.get(w.wheel)?.prefabId ?? '');
    if (wheel?.turn?.positions !== w.outlets.length) throw new WorldDataError(`水道 ${w.id} 的水輪位置數與節點數不同`);
    const prefabOf = (id: string) => world.prefabs.get(placementsById.get(id)?.prefabId ?? '');
    for (const id of w.outlets) {
      if (!prefabOf(id)?.activate) throw new WorldDataError(`水道 ${w.id} 的節點不是可啟動的物件：${id}`);
    }
    for (const id of w.blockers) {
      const p = prefabOf(id);
      if (!p?.activate && !p?.repair) throw new WorldDataError(`水道 ${w.id} 的阻擋點不能排除（需要 activate 或 repair）：${id}`);
    }
  }
  let shops: Map<string, ShopDef>;
  try {
    shops = parseShops(raw.shops ?? [], { items, npcs: new Set(npcs.map((n) => n.id)), quests: new Set(quests.keys()) });
  } catch (err) {
    throw new WorldDataError(`shops 資料錯誤：${err instanceof Error ? err.message : String(err)}`);
  }
  let crafting: CraftData;
  try {
    crafting = parseCraftData(raw.crafting ?? { stations: [{ id: 'none', nameKey: 'none', npc: npcs[0]?.id ?? 'none' }], recipes: [] }, { items, npcs: new Set(npcs.map((n) => n.id)), quests: new Set(quests.keys()) });
  } catch (err) {
    throw new WorldDataError(`crafting 資料錯誤：${err instanceof Error ? err.message : String(err)}`);
  }
  return { ...world, items, lootTables, regions, dialogues, npcs, quests, combat, companion, buildables, interiors, flocks, weapons, spells, landmarks, waterways, shops, crafting };
}
