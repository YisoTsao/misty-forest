// 權威狀態 ⇄ 存檔資料。讀檔時再檢查一次與目前遊戲資料的一致性：
// 資料檔更新後已不存在的物件或物品不讓整份存檔失效，而是略過並回報。
import type { EnemyRuntime, GameState } from '../authority/rules';
import { PLAYER_STATS, type CombatData } from '../combat/combat';
import { createInventory, type InventorySlot } from '../inventory/inventory';
import type { ItemCatalog } from '../items/items';
import type { WorldLookup } from '../world/objects';
import type { ObjectRuntime } from '../world/types';
import { SAVE_VERSION, saveDataSchema, type SaveData } from './schema';
import { migrateSave, SaveFormatError } from './migrate';

export type PlayerSnapshot = SaveData['player'];

export function toSaveData(state: GameState, player: PlayerSnapshot, savedAt: Date): SaveData {
  const objects: SaveData['world']['objects'] = [];
  for (const runtime of state.objects.values()) {
    const { placementId, harvested, respawnAt, hp, open, repaired } = runtime;
    // 只記錄與預設不同的欄位（規格 3.1 第 4 層）
    objects.push({
      placementId,
      ...(harvested ? { harvested } : {}),
      ...(respawnAt !== undefined ? { respawnAt } : {}),
      ...(hp !== undefined ? { hp } : {}),
      ...(open ? { open } : {}),
      ...(repaired ? { repaired } : {}),
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
      enemies: [...state.enemies.values()].map((e) => ({ ...e })),
      spawners: Object.fromEntries(Object.entries(state.spawners).map(([id, s]) => [id, { ...s }])),
    },
    companion: { ...state.companion },
  };
}

export type LoadedSave = { state: GameState; player: PlayerSnapshot; savedAt: string; warnings: string[] };

/** 遷移 → zod 驗證 → 轉回權威狀態。格式不符時拋 SaveFormatError。 */
export function fromSaveData(raw: unknown, ctx: { world: WorldLookup; items: ItemCatalog; combat: CombatData }): LoadedSave {
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
    enemies.set(e.id, { ...e });
  }

  return {
    state: {
      time: data.world.time,
      objects,
      inventory: { slots },
      tutorial: data.tutorial,
      mist: data.mist,
      quests: data.quests,
      player: { hp: Math.min(PLAYER_STATS.maxHp, data.combat.hp > 0 ? data.combat.hp : PLAYER_STATS.maxHp), lastDamagedAt: data.world.time, defeated: false },
      enemies,
      spawners: data.combat.spawners,
      companion: data.companion,
    },
    player: data.player,
    savedAt: data.savedAt,
    warnings,
  };
}
