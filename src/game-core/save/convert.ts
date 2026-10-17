// 權威狀態 ⇄ 存檔資料。讀檔時再檢查一次與目前遊戲資料的一致性：
// 資料檔更新後已不存在的物件或物品不讓整份存檔失效，而是略過並回報。
import type { EnemyRuntime, GameState } from '../authority/rules';
import type { BuildableCatalog } from '../build/build';
import { PLAYER_STATS, type CombatData } from '../combat/combat';
import { MAX_MP } from '../combat/spells';
import { createInventory, type InventorySlot } from '../inventory/inventory';
import type { ItemCatalog } from '../items/items';
import { createExplored, decodeExplored, encodeExplored } from '../map/explore';
import type { WorldLookup } from '../world/objects';
import type { ObjectRuntime } from '../world/types';
import { SAVE_VERSION, saveDataSchema, type SaveData } from './schema';
import { migrateSave, SaveFormatError } from './migrate';

export type PlayerSnapshot = SaveData['player'];

export function toSaveData(state: GameState, player: PlayerSnapshot, savedAt: Date): SaveData {
  const objects: SaveData['world']['objects'] = [];
  for (const runtime of state.objects.values()) {
    const { placementId, harvested, respawnAt, hp, open, repaired, active, turn, activatedAt } = runtime;
    // 只記錄與預設不同的欄位（規格 3.1 第 4 層）
    objects.push({
      placementId,
      ...(harvested ? { harvested } : {}),
      ...(respawnAt !== undefined ? { respawnAt } : {}),
      ...(hp !== undefined ? { hp } : {}),
      ...(open ? { open } : {}),
      ...(repaired ? { repaired } : {}),
      ...(active ? { active } : {}),
      ...(turn ? { turn } : {}),
      ...(activatedAt !== undefined ? { activatedAt } : {}),
    });
  }
  return {
    version: SAVE_VERSION,
    savedAt: savedAt.toISOString(),
    player: { position: { ...player.position }, facingYaw: player.facingYaw },
    world: { time: state.time, objects },
    inventory: { slots: state.inventory.slots.map((s) => (s ? { ...s } : null)) },
    tutorial: state.tutorial,
    mist: { ...state.mist },
    quests: Object.fromEntries(Object.entries(state.quests).map(([id, r]) => [id, { ...r, ...(r.progress ? { progress: [...r.progress] } : {}) }])),
    combat: {
      // 倒下時存檔：讀回來就是重新站起來（滿血）
      hp: state.player.defeated ? PLAYER_STATS.maxHp : state.player.hp,
      mp: state.player.mp,
      enemies: [...state.enemies.values()].map((e) => ({ ...e })),
      spawners: Object.fromEntries(Object.entries(state.spawners).map(([id, s]) => [id, { ...s }])),
      defeatedBosses: [...state.defeatedBosses],
    },
    companion: { ...state.companion },
    build: { buildings: state.buildings.map((b) => ({ ...b })), nextBuildingId: state.nextBuildingId },
    loadout: { weapon: state.player.weapon, heroClass: state.player.heroClass },
    map: { explored: encodeExplored(state.explored) },
  };
}

export type LoadedSave = { state: GameState; player: PlayerSnapshot; savedAt: string; warnings: string[] };

/** 遷移 → zod 驗證 → 轉回權威狀態。格式不符時拋 SaveFormatError。 */
export function fromSaveData(raw: unknown, ctx: { world: WorldLookup; items: ItemCatalog; combat: CombatData; buildables: BuildableCatalog }): LoadedSave {
  const parsed = saveDataSchema.safeParse(migrateSave(raw));
  if (!parsed.success) throw new SaveFormatError(`存檔格式錯誤：${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('；')}`);
  const data = parsed.data;
  const warnings: string[] = [];

  const objects = new Map<string, ObjectRuntime>();
  for (const delta of data.world.objects) {
    if (!ctx.world.placement(delta.placementId)) {
      warnings.push(`略過已不存在的物件：${delta.placementId}`);
      continue;
    }
    objects.set(delta.placementId, { ...delta });
  }

  const inventory = createInventory();
  const slots: InventorySlot[] = [...inventory.slots];
  data.inventory.slots.forEach((slot, i) => {
    if (!slot) return;
    const def = ctx.items.get(slot.itemId);
    if (!def) {
      warnings.push(`略過已不存在的物品：${slot.itemId}`);
      return;
    }
    if (i >= slots.length) {
      warnings.push(`背包格數變少，略過第 ${i + 1} 格的 ${slot.itemId}`);
      return;
    }
    slots[i] = { itemId: slot.itemId, count: Math.min(slot.count, def.maxStack) };
  });

  const enemies = new Map<string, EnemyRuntime>();
  for (const e of data.combat.enemies) {
    if (!ctx.combat.enemies.has(e.kind) || !ctx.combat.spawners.some((s) => s.id === e.spawner)) {
      warnings.push(`略過已不存在的敵人：${e.id}`);
      continue;
    }
    // 存檔時正在打的頭目：讀檔後回到戰場重新開戰（不保留打到一半的血量）
    if (ctx.combat.enemies.get(e.kind)?.boss) continue;
    enemies.set(e.id, { ...e });
  }

  let explored = decodeExplored(data.map.explored);
  if (!explored) {
    warnings.push('世界地圖的探索紀錄格式不符（地圖大小可能改變），重新開始紀錄');
    explored = createExplored();
  }

  return {
    state: {
      time: data.world.time,
      // 共享時鐘不存檔：讀檔後第一幀由 GameClock 對時
      clock: 0,
      objects,
      inventory: { slots },
      tutorial: data.tutorial,
      mist: data.mist,
      quests: data.quests,
      player: {
        hp: Math.min(PLAYER_STATS.maxHp, data.combat.hp > 0 ? data.combat.hp : PLAYER_STATS.maxHp),
        lastDamagedAt: data.world.time,
        defeated: false,
        weapon: data.loadout.weapon,
        mp: Math.min(MAX_MP, data.combat.mp),
        heroClass: data.loadout.heroClass,
      },
      enemies,
      spawners: data.combat.spawners,
      companion: data.companion,
      buildings: data.build.buildings.filter((b) => {
        if (ctx.buildables.has(b.buildable)) return true;
        warnings.push(`略過已不存在的建造物：${b.buildable}`);
        return false;
      }),
      nextBuildingId: data.build.nextBuildingId,
      explored,
      defeatedBosses: data.combat.defeatedBosses.filter((id) => {
        if (ctx.combat.enemies.get(id)?.boss) return true;
        warnings.push(`略過已不存在的頭目：${id}`);
        return false;
      }),
    },
    player: data.player,
    savedAt: data.savedAt,
    warnings,
  };
}
