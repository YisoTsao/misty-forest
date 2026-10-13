// 權威規則（規格 3.2：指令 → 權威層 → 事件）。
// handleCommand 為純函式：輸入目前狀態、指令與規則所需的資料，輸出事件；狀態只由 applyEvents 推導。
// 單人時由 LocalAuthority 在同一行程呼叫；Phase 6 伺服器可直接重用。
import { addItems, createInventory, type Inventory } from '../inventory/inventory';
import { rollLoot, type ItemCatalog, type ItemStack, type LootTables } from '../items/items';
import type { ObjectRuntimeMap, WorldLookup } from '../world/objects';
import type { ObjectRuntime } from '../world/types';

/** 權威遊戲狀態。之後的階段會加入任務、各區域迷霧、建造物件等。 */
export type GameState = {
  /** 遊戲時間（秒）：只在遊玩中前進，重生計時以此為準，並隨存檔保存 */
  readonly time: number;
  readonly objects: ObjectRuntimeMap;
  readonly inventory: Inventory;
};

export function initialGameState(): GameState {
  return { time: 0, objects: new Map(), inventory: createInventory() };
}

export type GameCommand =
  | { type: 'HarvestObject'; placementId: string }
  | { type: 'OpenChest'; placementId: string }
  /** 遊戲時間前進；player 為玩家目前水平位置（站在重生點上時延後重生，避免卡進碰撞體） */
  | { type: 'AdvanceTime'; dt: number; player?: { x: number; z: number } };

export type RejectReason =
  | 'unknown-object'
  | 'wrong-interaction'
  | 'already-open'
  | 'already-harvested'
  | 'inventory-full'
  | 'invalid-command';

export type GameEvent =
  | { type: 'TimeAdvanced'; time: number }
  | { type: 'ObjectHarvested'; placementId: string; respawnAt?: number }
  | { type: 'ObjectRespawned'; placementId: string }
  | { type: 'ChestOpened'; placementId: string }
  | { type: 'ItemsGained'; items: ItemStack[]; source?: string }
  | { type: 'CommandRejected'; command: GameCommand['type']; placementId?: string; reason: RejectReason };

/** 規則需要的靜態資料與亂數來源（由呼叫端注入，規則本身不碰全域狀態） */
export type RulesContext = {
  world: WorldLookup;
  items: ItemCatalog;
  lootTables: LootTables;
  random: () => number;
};

/** 玩家站在此距離內時，物件延後重生 */
export const RESPAWN_CLEARANCE = 2.5;

export function handleCommand(state: GameState, cmd: GameCommand, ctx: RulesContext): GameEvent[] {
  switch (cmd.type) {
    case 'HarvestObject':
      return harvest(state, cmd.placementId, ctx);
    case 'OpenChest':
      return openChest(state, cmd.placementId, ctx);
    case 'AdvanceTime':
      return advanceTime(state, cmd, ctx);
  }
}

function reject(command: GameCommand['type'], reason: RejectReason, placementId?: string): GameEvent[] {
  return [{ type: 'CommandRejected', command, placementId, reason }];
}

function lookup(ctx: RulesContext, placementId: string) {
  const placement = ctx.world.placement(placementId);
  const prefab = placement && ctx.world.prefab(placement.prefabId);
  return placement && prefab ? { placement, prefab } : null;
}

/** 擲掉落表並確認背包放得下；放不下回傳 null */
function rollIntoInventory(state: GameState, tableId: string, ctx: RulesContext): ItemStack[] | null {
  const table = ctx.lootTables.get(tableId);
  if (!table) throw new Error(`未知的掉落表：${tableId}`);
  const items = rollLoot(table, ctx.random);
  return addItems(state.inventory, items, ctx.items) ? items : null;
}

function harvest(state: GameState, placementId: string, ctx: RulesContext): GameEvent[] {
  const found = lookup(ctx, placementId);
  if (!found) return reject('HarvestObject', 'unknown-object', placementId);
  const { harvest: spec, interaction } = found.prefab;
  if (interaction !== 'harvest' || !spec) return reject('HarvestObject', 'wrong-interaction', placementId);
  if (state.objects.get(placementId)?.harvested) return reject('HarvestObject', 'already-harvested', placementId);
  const items = rollIntoInventory(state, spec.lootTableId, ctx);
  if (!items) return reject('HarvestObject', 'inventory-full', placementId);
  const respawnAt = spec.respawnSec === undefined ? undefined : state.time + spec.respawnSec;
  return [
    { type: 'ObjectHarvested', placementId, respawnAt },
    { type: 'ItemsGained', items, source: placementId },
  ];
}

function openChest(state: GameState, placementId: string, ctx: RulesContext): GameEvent[] {
  const found = lookup(ctx, placementId);
  if (!found) return reject('OpenChest', 'unknown-object', placementId);
  if (found.prefab.interaction !== 'open') return reject('OpenChest', 'wrong-interaction', placementId);
  // 規格 5.2：寶箱記錄開關，唯一獎勵不可重複領取
  if (state.objects.get(placementId)?.open) return reject('OpenChest', 'already-open', placementId);
  const tableId = found.prefab.contents?.lootTableId;
  if (!tableId) return [{ type: 'ChestOpened', placementId }];
  // 背包放不下時寶箱保持關閉，獎勵不會遺失
  const items = rollIntoInventory(state, tableId, ctx);
  if (!items) return reject('OpenChest', 'inventory-full', placementId);
  return [
    { type: 'ChestOpened', placementId },
    { type: 'ItemsGained', items, source: placementId },
  ];
}

function advanceTime(state: GameState, cmd: Extract<GameCommand, { type: 'AdvanceTime' }>, ctx: RulesContext): GameEvent[] {
  if (!(cmd.dt > 0) || !Number.isFinite(cmd.dt)) return reject('AdvanceTime', 'invalid-command');
  const time = state.time + cmd.dt;
  const events: GameEvent[] = [{ type: 'TimeAdvanced', time }];
  for (const [id, runtime] of state.objects) {
    if (!runtime.harvested || runtime.respawnAt === undefined || runtime.respawnAt > time) continue;
    const position = ctx.world.placement(id)?.position;
    if (position && cmd.player && Math.hypot(position[0] - cmd.player.x, position[2] - cmd.player.z) < RESPAWN_CLEARANCE) continue;
    events.push({ type: 'ObjectRespawned', placementId: id });
  }
  return events;
}

/** 套用事件，回傳新狀態（不修改輸入）。沒有物件事件時保留原本的 objects 參照，讓 selector 不必重新計算。 */
export function applyEvents(state: GameState, events: readonly GameEvent[], ctx: Pick<RulesContext, 'items'>): GameState {
  let { time, objects, inventory } = state;
  let nextObjects: Map<string, ObjectRuntime> | null = null;
  const mutableObjects = () => (nextObjects ??= new Map(objects));
  const patch = (id: string, change: Partial<ObjectRuntime>) => {
    const map = mutableObjects();
    const merged: ObjectRuntime = { ...(map.get(id) ?? { placementId: id }), ...change };
    // 回到預設狀態的物件從表中移除，存檔只記錄差異
    if (!merged.open && !merged.harvested && merged.respawnAt === undefined && merged.hp === undefined) map.delete(id);
    else map.set(id, merged);
  };

  for (const e of events) {
    switch (e.type) {
      case 'TimeAdvanced':
        time = e.time;
        break;
      case 'ObjectHarvested':
        patch(e.placementId, { harvested: true, respawnAt: e.respawnAt });
        break;
      case 'ObjectRespawned':
        patch(e.placementId, { harvested: undefined, respawnAt: undefined });
        break;
      case 'ChestOpened':
        patch(e.placementId, { open: true });
        break;
      case 'ItemsGained': {
        const next = addItems(inventory, e.items, ctx.items);
        // 規則已檢查過容量；走到這裡代表事件與狀態不一致，必須明確失敗
        if (!next) throw new Error('ItemsGained 事件無法放入背包（事件與狀態不一致）');
        inventory = next;
        break;
      }
      case 'CommandRejected':
        break;
    }
  }
  if (nextObjects) objects = nextObjects;
  return { time, objects, inventory };
}
