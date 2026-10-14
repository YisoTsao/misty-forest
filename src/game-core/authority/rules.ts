// 權威規則（規格 3.2：指令 → 權威層 → 事件）。
// handleCommand 為純函式：輸入目前狀態、指令與規則所需的資料，輸出事件；狀態只由 applyEvents 推導。
// 單人時由 LocalAuthority 在同一行程呼叫；Phase 6 伺服器可直接重用。
import { isBuildableUnlocked, placementProblem, refundFor, snapToGrid, snapYaw, type Building, type BuildableCatalog, type PlacementProblem } from '../build/build';
import { bossRequirementsMet, bossShieldScale, bossSpawner, PLAYER_STATS, stanceDamageScale, type BossDef, type BossMoveId, type CombatData, type EnemyStance } from '../combat/combat';
import { DEFAULT_WEAPON, type WeaponCatalog, type WeaponId } from '../combat/weapons';
import { MAX_MP, regenMp, type SpellCatalog } from '../combat/spells';
import { addItems, createInventory, removeItems, type Inventory } from '../inventory/inventory';
import { cellsToReveal, createExplored, EXPLORE_CELLS, withCells, type Explored } from '../map/explore';
import { rollLoot, type ItemCatalog, type ItemStack, type LootTables } from '../items/items';
import { type QuestDef, earlierObjectivesDone, isQuestTracked, talkObjectiveIndex, talksDone, MAX_TRACKED_SIDE, questConsumption, questStatus, isQuestReady, trackedSideCount, type QuestCatalog, type QuestRecord } from '../quest/quest';
import { nextTutorialStep, type TutorialStep } from '../tutorial/tutorial';
import type { MistStage } from '../world/mist';
import { secondsUntilHour } from '../world/timeOfDay';
import { initialMistStages, type MistStages } from '../world/regions';
import type { RegionId } from '../world/types';
import type { ObjectRuntimeMap, WorldLookup } from '../world/objects';
import type { ObjectRuntime } from '../world/types';
import { outletsToWake, type WaterwayDef } from '../world/waterway';
import { availableStock, COIN, MAX_TRADE, type ShopCatalog } from '../shop/shop';
import type { CraftData } from '../craft/craft';

/** 權威遊戲狀態。之後的階段會加入任務、各區域迷霧、建造物件等。 */
export type GameState = {
  /** 遊戲時間（秒）：只在遊玩中前進，重生計時以此為準，並隨存檔保存 */
  readonly time: number;
  readonly objects: ObjectRuntimeMap;
  readonly inventory: Inventory;
  /** 教學引導目前的步驟 */
  readonly tutorial: TutorialStep;
  /** 各區域的迷霧階段（規格 1.4） */
  readonly mist: MistStages;
  /** 已接取或完成的任務（規格 6.5）；沒有紀錄表示尚未接取 */
  readonly quests: Readonly<Record<string, QuestRecord>>;
  /** 玩家的戰鬥狀態（規格 6.6）：血量、上次受傷的遊戲時間、是否倒下 */
  /** weapon：目前裝備的近戰武器（GAME_DESIGN 5.3，存檔 v8）；mp：星光值（GAME_DESIGN 5.4，存檔 v9） */
  readonly player: { readonly hp: number; readonly lastDamagedAt: number; readonly defeated: boolean; readonly weapon: WeaponId; readonly mp: number };
  /** 目前存在的敵人（位置由本機模擬，權威層只管血量與存在） */
  readonly enemies: ReadonlyMap<string, EnemyRuntime>;
  /** 各生成點下次可以補充敵人的時間與流水號 */
  readonly spawners: Readonly<Record<string, SpawnerRuntime>>;
  /** 星光夥伴（規格 5.2：只持久化解鎖旗標，位置不持久化） */
  readonly companion: { readonly unlocked: boolean };
  /** 已放置的建造物（規格 6.7）與下一個流水號 */
  readonly buildings: readonly Building[];
  readonly nextBuildingId: number;
  /** 世界地圖的探索紀錄（Bible §31.3，存檔 v11）：只在 AreaExplored 事件時換新參照 */
  readonly explored: Explored;
  /** 已擊敗的頭目（任務 8D，存檔 v14）：擊敗後不再開戰 */
  readonly defeatedBosses: readonly string[];
};

export type EnemyRuntime = { readonly id: string; readonly kind: string; readonly spawner: string; readonly hp: number };
export type SpawnerRuntime = { readonly nextSpawnAt: number; readonly counter: number };

export function initialGameState(): GameState {
  return {
    time: 0,
    objects: new Map(),
    inventory: createInventory(),
    tutorial: 'move',
    mist: initialMistStages,
    quests: {},
    player: { hp: PLAYER_STATS.maxHp, lastDamagedAt: 0, defeated: false, weapon: DEFAULT_WEAPON, mp: MAX_MP },
    enemies: new Map(),
    spawners: {},
    companion: { unlocked: false },
    buildings: [],
    nextBuildingId: 1,
    explored: createExplored(),
    defeatedBosses: [],
  };
}

export type GameCommand =
  | { type: 'HarvestObject'; placementId: string }
  | { type: 'OpenChest'; placementId: string }
  /** 遊戲時間前進；player 為玩家目前水平位置（站在重生點上時延後重生，避免卡進碰撞體） */
  | { type: 'AdvanceTime'; dt: number; player?: { x: number; z: number } }
  /** 完成教學的某一步（from 必須是目前的步驟，重複送出不會跳過步驟） */
  | { type: 'AdvanceTutorial'; from: TutorialStep }
  | { type: 'AcceptQuest'; quest: string }
  /** 在工作台製作（任務 7J） */
  | { type: 'Craft'; recipe: string }
  /** 使用消耗品（任務 7I）：藥水回血、藥膏回血並解除緩速 */
  | { type: 'UseItem'; itemId: string }
  /** 在商店買 / 賣（任務 7H）：以種籽幣交易，count 為數量 */
  | { type: 'BuyItem'; shop: string; itemId: string; count: number }
  | { type: 'SellItem'; shop: string; itemId: string; count: number }
  /** 在對話中完成「和 npc 談」的任務目標（任務 7G 送信）：交出物品、記錄順序 */
  | { type: 'QuestTalk'; quest: string; npc: string }
  /** 任務日誌：追蹤 / 取消追蹤進行中的任務（主線一定追蹤；其他最多 MAX_TRACKED_SIDE 個，任務 7F） */
  | { type: 'TrackQuest'; quest: string; tracked: boolean }
  /** 修復物件（木橋）：消耗材料 */
  | { type: 'RepairObject'; placementId: string }
  /** 啟動開關式機關（任務 8C：點亮路燈、移開樹根、打開閘門） */
  | { type: 'ActivateObject'; placementId: string }
  /** 轉動機關到下一個位置（任務 8C 水輪） */
  | { type: 'TurnObject'; placementId: string }
  /**
   * 玩家攻擊命中敵人（命中判定在本機以招式範圍計算，規則驗證目標存在並結算傷害）。
   * attack：近戰招式 id（必須屬於目前裝備的武器，data/weapons.json），或法術 id（data/spells.json）
   */
  /** stance：敵人出手當下的姿態（本機 AI；根鬚甲蟲縮殼減傷、破綻加傷，任務 8B） */
  | { type: 'AttackEnemy'; enemyId: string; attack: string; stance?: EnemyStance }
  /** 施放法術：扣除星光值（GAME_DESIGN 5.4）；冷卻在本機計算 */
  | { type: 'CastSpell'; spell: string }
  /** 切換近戰武器（GAME_DESIGN 5.3） */
  | { type: 'EquipWeapon'; weapon: WeaponId }
  /** 敵人攻擊前搖結束、玩家在攻擊範圍內 */
  /** spit：迷霧芽怪的泥團命中（傷害依行為資料，並讓玩家變慢）；move：頭目的招式命中（任務 8D） */
  | { type: 'EnemyStrike'; enemyId: string; spit?: boolean; move?: BossMoveId }
  /** 玩家走進頭目戰場：開戰（任務 8D） */
  | { type: 'StartBossFight'; boss: string }
  /** 玩家離開戰場（傳送、換地圖）：頭目回去，下次走進來重新開戰 */
  | { type: 'EndBossFight'; boss: string }
  /** 倒下後重新站起來 */
  | { type: 'RespawnPlayer' }
  /** 在酒館休息（對話選項）：體力回滿 */
  | { type: 'Rest' }
  /** 在酒館睡到指定時刻（對話選項，GAME_DESIGN 5.2）：體力回滿、時間往前推進到 untilHour */
  | { type: 'Sleep'; untilHour: number }
  /** 放置建造物（位置與角度由規則吸附到網格）；確認後才扣材料 */
  | { type: 'PlaceBuilding'; buildable: string; x: number; z: number; yaw: number }
  /** 拆除建造物，退還材料 */
  | { type: 'RemoveBuilding'; buildingId: string }
  /** 玩家走到 (x, z)：紀錄附近新看到的地圖格子（世界地圖的探索霧罩） */
  | { type: 'ExploreArea'; x: number; z: number }
  /** 除錯 / 截圖：整張地圖標為已探索（ctx.allowDebugCommands 為 true 時才接受） */
  | { type: 'DebugRevealMap' }
  /** 回報任務：目標全部達成時交出物品、領取獎勵 */
  | { type: 'TurnInQuest'; quest: string }
  /** 除錯 / 美術驗收：直接設定區域的迷霧階段（ctx.allowDebugCommands 為 true 時才接受） */
  | { type: 'DebugSetMistStage'; region: RegionId; stage: MistStage }
  /** 除錯 / 測試：直接放入物品（ctx.allowDebugCommands 為 true 時才接受） */
  | { type: 'DebugGiveItems'; items: ItemStack[] }
  /** 除錯 / 美術驗收：時間往前推進到指定時刻（只往前，不倒轉；ctx.allowDebugCommands 為 true 時才接受） */
  | { type: 'DebugSetClock'; hour: number }
  /** 除錯 / 測試：直接設定星光值（ctx.allowDebugCommands 為 true 時才接受） */
  | { type: 'DebugSetMp'; mp: number }
  /** 除錯 / 測試：直接設定體力（ctx.allowDebugCommands 為 true 時才接受） */
  | { type: 'DebugSetHp'; hp: number };

export type RejectReason =
  | 'unknown-object'
  | 'wrong-interaction'
  | 'already-open'
  | 'already-harvested'
  | 'inventory-full'
  | 'tutorial-mismatch'
  | 'unknown-quest'
  | 'quest-unavailable'
  | 'quest-incomplete'
  | 'already-repaired'
  | 'already-active'
  | 'missing-materials'
  | 'unknown-enemy'
  | 'player-defeated'
  | 'unknown-buildable'
  | 'unknown-building'
  | PlacementProblem
  | 'not-allowed'
  | 'unknown-move'
  | 'weapon-not-equipped'
  | 'unknown-spell'
  | 'not-enough-mp'
  | 'already-defeated'
  | 'not-in-fight'
  | 'boss-not-defeated'
  | 'out-of-order'
  | 'track-limit'
  | 'too-soon'
  | 'not-enough-coins'
  | 'not-usable'
  | 'recipe-locked'
  | 'hp-full'
  | 'not-for-sale'
  | 'invalid-command';

export type GameEvent =
  | { type: 'TimeAdvanced'; time: number }
  | { type: 'ObjectHarvested'; placementId: string; respawnAt?: number }
  | { type: 'ObjectRespawned'; placementId: string }
  | { type: 'ChestOpened'; placementId: string }
  | { type: 'ItemsGained'; items: ItemStack[]; source?: string }
  | { type: 'TutorialAdvanced'; step: TutorialStep }
  | { type: 'MistStageChanged'; region: RegionId; stage: MistStage }
  | { type: 'QuestAccepted'; quest: string }
  | { type: 'QuestTracked'; quest: string; tracked: boolean }
  | { type: 'QuestCompleted'; quest: string }
  | { type: 'ItemsRemoved'; items: ItemStack[]; reason: 'quest' | 'repair' | 'shop' | 'use' | 'craft' }
  | { type: 'ObjectRepaired'; placementId: string }
  /** 機關啟動；source：玩家互動、水流喚醒（苔蘚節點）或任務獎勵 */
  | { type: 'ObjectActivated'; placementId: string; source: 'player' | 'water' | 'quest' }
  | { type: 'ObjectTurned'; placementId: string; turn: number }
  | { type: 'EnemySpawned'; enemyId: string; kind: string; spawner: string; hp: number }
  | { type: 'EnemyDespawned'; enemyId: string }
  /** attack：招式 id 或 'skill' */
  | { type: 'EnemyDamaged'; enemyId: string; amount: number; hp: number; attack: string }
  | { type: 'WeaponEquipped'; weapon: WeaponId }
  /** mp：施放後剩下的星光值 */
  | { type: 'SpellCast'; spell: string; mp: number }
  /** 星光值回復或除錯設定 */
  | { type: 'MpChanged'; mp: number }
  | { type: 'EnemyDefeated'; enemyId: string; kind: string; spawner: string }
  /** 頭目被擊敗（任務 8D）：記錄下來，不再開戰 */
  | { type: 'BossDefeated'; boss: string }
  | { type: 'SpawnerCooldown'; spawner: string; nextSpawnAt: number }
  | { type: 'PlayerDamaged'; amount: number; hp: number; enemyId: string }
  /** 被迷霧芽怪的泥團打中：一段時間內移動變慢（本機表現，不存檔） */
  /** cause：spores 為頭目的睡眠孢子（任務 8D），省略為泥團 */
  | { type: 'PlayerSlowed'; sec: number; scale: number; cause?: 'spores' }
  | { type: 'PlayerHealed'; hp: number }
  /** 用月露藥膏解除緩速（本機表現，任務 7I） */
  | { type: 'PlayerSlowCured' }
  | { type: 'PlayerDefeated' }
  | { type: 'PlayerRespawned'; hp: number }
  | { type: 'QuestProgressed'; quest: string; objective: number; count: number }
  | { type: 'CompanionUnlocked' }
  | { type: 'BuildingPlaced'; building: Building; cost: ItemStack[] }
  | { type: 'BuildingRemoved'; buildingId: string; refund: ItemStack[] }
  /** 新探索的地圖格子（索引見 map/explore.ts） */
  | { type: 'AreaExplored'; cells: number[] }
  | { type: 'CommandRejected'; command: GameCommand['type']; placementId?: string; reason: RejectReason };

/** 規則需要的靜態資料與亂數來源（由呼叫端注入，規則本身不碰全域狀態） */
export type RulesContext = {
  world: WorldLookup;
  items: ItemCatalog;
  lootTables: LootTables;
  random: () => number;
  quests: QuestCatalog;
  combat: CombatData;
  weapons: WeaponCatalog;
  spells: SpellCatalog;
  buildables: BuildableCatalog;
  /** 工作台與配方（任務 7J）；省略時沒有配方 */
  crafting?: CraftData;
  /** 商店（任務 7H）；省略時沒有商店 */
  shops?: ShopCatalog;
  /** 水道謎題（任務 8C）；省略時沒有水道 */
  waterways?: readonly WaterwayDef[];
  /** 世界靜態物件的佔用查詢（建造檢查用）；省略時視為沒有障礙 */
  isOccupied?: (x: number, z: number, margin: number) => boolean;
  /** 是否接受除錯指令（單人開發 / 測試為 true；日後伺服器為 false） */
  allowDebugCommands?: boolean;
};

/** 玩家站在此距離內時，物件延後重生 */
export const RESPAWN_CLEARANCE = 2.5;

export function handleCommand(state: GameState, cmd: GameCommand, ctx: RulesContext): GameEvent[] {
  return withAutoComplete(state, handleCommandInner(state, cmd, ctx), ctx);
}

/**
 * 沒有發起人的探索任務（任務 7L）：這個指令讓目標全部達成時，接著自動完成（領取獎勵）。
 * 只在有進行中的這類任務時才計算（大部分指令不受影響）。
 */
function withAutoComplete(state: GameState, events: GameEvent[], ctx: RulesContext): GameEvent[] {
  if (events.length === 0 || events.some((e) => e.type === 'CommandRejected')) return events;
  const candidates = [...ctx.quests.values()].filter((q) => q.giver === undefined && (state.quests[q.id]?.status === 'active' || events.some((e) => e.type === 'QuestAccepted' && e.quest === q.id)));
  if (candidates.length === 0) return events;
  let next = applyEvents(state, events, ctx);
  for (const q of candidates) {
    if (!isQuestReady(next, q)) continue;
    const done = turnInQuest(next, q.id, ctx);
    if (done.some((e) => e.type === 'CommandRejected')) continue;
    events = [...events, ...done];
    next = applyEvents(next, done, ctx);
  }
  return events;
}

function handleCommandInner(state: GameState, cmd: GameCommand, ctx: RulesContext): GameEvent[] {
  switch (cmd.type) {
    case 'HarvestObject':
      return harvest(state, cmd.placementId, ctx);
    case 'OpenChest':
      return openChest(state, cmd.placementId, ctx);
    case 'AdvanceTime':
      return advanceTime(state, cmd, ctx);
    case 'AdvanceTutorial':
      if (cmd.from !== state.tutorial || state.tutorial === 'done') return reject('AdvanceTutorial', 'tutorial-mismatch');
      return [{ type: 'TutorialAdvanced', step: nextTutorialStep(cmd.from) }];
    case 'RepairObject':
      return withWater(state, repairObject(state, cmd.placementId, ctx), ctx);
    case 'ActivateObject':
      return withWater(state, activateObject(state, cmd.placementId, ctx), ctx);
    case 'TurnObject':
      return withWater(state, turnObject(state, cmd.placementId, ctx), ctx);
    case 'AttackEnemy':
      return attackEnemy(state, cmd.enemyId, cmd.attack, ctx, cmd.stance);
    case 'CastSpell': {
      if (state.player.defeated) return reject('CastSpell', 'player-defeated');
      const spell = ctx.spells.get(cmd.spell);
      if (!spell) return reject('CastSpell', 'unknown-spell');
      if (state.player.mp < spell.mpCost) return reject('CastSpell', 'not-enough-mp');
      return [{ type: 'SpellCast', spell: spell.id, mp: state.player.mp - spell.mpCost }];
    }
    case 'DebugSetHp':
      if (!ctx.allowDebugCommands) return reject('DebugSetHp', 'not-allowed');
      if (!Number.isFinite(cmd.hp) || state.player.defeated) return reject('DebugSetHp', 'invalid-command');
      {
        const hp = Math.min(PLAYER_STATS.maxHp, Math.max(1, cmd.hp));
        // 調低時當作受傷（記錄受傷時間，之後一段時間才開始回血）
        return hp < state.player.hp ? [{ type: 'PlayerDamaged', amount: state.player.hp - hp, hp, enemyId: 'debug' }] : [{ type: 'PlayerHealed', hp }];
      }
    case 'DebugSetMp':
      if (!ctx.allowDebugCommands) return reject('DebugSetMp', 'not-allowed');
      if (!Number.isFinite(cmd.mp)) return reject('DebugSetMp', 'invalid-command');
      return [{ type: 'MpChanged', mp: Math.min(MAX_MP, Math.max(0, cmd.mp)) }];
    case 'EquipWeapon':
      if (!ctx.weapons.weapons.has(cmd.weapon)) return reject('EquipWeapon', 'invalid-command');
      if (state.player.weapon === cmd.weapon) return [];
      return [{ type: 'WeaponEquipped', weapon: cmd.weapon }];
    case 'EnemyStrike':
      return enemyStrike(state, cmd.enemyId, ctx, cmd.spit === true, cmd.move);
    case 'StartBossFight':
      return startBossFight(state, cmd.boss, ctx);
    case 'EndBossFight': {
      const fighting = bossEnemies(state, cmd.boss);
      if (fighting.length === 0) return reject('EndBossFight', 'not-in-fight');
      return fighting.map((e) => ({ type: 'EnemyDespawned', enemyId: e.id }));
    }
    case 'RespawnPlayer':
      if (!state.player.defeated) return reject('RespawnPlayer', 'invalid-command');
      return [{ type: 'PlayerRespawned', hp: PLAYER_STATS.maxHp }];
    case 'Rest':
      if (state.player.defeated) return reject('Rest', 'player-defeated');
      return [{ type: 'PlayerHealed', hp: PLAYER_STATS.maxHp }];
    case 'Sleep': {
      if (state.player.defeated) return reject('Sleep', 'player-defeated');
      if (!validHour(cmd.untilHour)) return reject('Sleep', 'invalid-command');
      return [...skipToHour(state, cmd.untilHour, ctx), { type: 'PlayerHealed', hp: PLAYER_STATS.maxHp }];
    }
    case 'PlaceBuilding':
      return placeBuilding(state, cmd, ctx);
    case 'ExploreArea': {
      if (!Number.isFinite(cmd.x) || !Number.isFinite(cmd.z)) return reject('ExploreArea', 'invalid-command');
      const cells = cellsToReveal(state.explored, cmd.x, cmd.z);
      const events: GameEvent[] = cells.length > 0 ? [{ type: 'AreaExplored', cells }] : [];
      return [...events, ...visitEvents(state, cmd.x, cmd.z, ctx)];
    }
    case 'DebugRevealMap':
      if (!ctx.allowDebugCommands) return reject('DebugRevealMap', 'not-allowed');
      return [{ type: 'AreaExplored', cells: Array.from({ length: EXPLORE_CELLS }, (_, i) => i) }];
    case 'RemoveBuilding': {
      const building = state.buildings.find((b) => b.id === cmd.buildingId);
      const def = building && ctx.buildables.get(building.buildable);
      if (!building || !def) return reject('RemoveBuilding', 'unknown-building');
      const refund = refundFor(def);
      // 退還的材料放不下時不能拆（材料不會遺失）
      if (!addItems(state.inventory, refund, ctx.items)) return reject('RemoveBuilding', 'inventory-full');
      return [
        { type: 'BuildingRemoved', buildingId: building.id, refund },
        { type: 'ItemsGained', items: refund, source: building.id },
      ];
    }
    case 'AcceptQuest':
      return acceptQuest(state, cmd.quest, ctx);
    case 'Craft':
      return craft(state, cmd.recipe, ctx);
    case 'UseItem':
      return consumeItem(state, cmd.itemId, ctx);
    case 'BuyItem':
      return buyItem(state, cmd, ctx);
    case 'SellItem':
      return sellItem(state, cmd, ctx);
    case 'QuestTalk':
      return questTalk(state, cmd.quest, cmd.npc, ctx);
    case 'TrackQuest': {
      const def = ctx.quests.get(cmd.quest);
      const record = state.quests[cmd.quest];
      if (!def) return reject('TrackQuest', 'unknown-quest');
      if (record?.status !== 'active' || def.category === 'main') return reject('TrackQuest', 'quest-unavailable');
      if (isQuestTracked(record, def) === cmd.tracked) return [];
      if (cmd.tracked && trackedSideCount(state.quests, ctx.quests) >= MAX_TRACKED_SIDE) return reject('TrackQuest', 'track-limit');
      return [{ type: 'QuestTracked', quest: cmd.quest, tracked: cmd.tracked }];
    }
    case 'TurnInQuest':
      return turnInQuest(state, cmd.quest, ctx);
    case 'DebugGiveItems':
      if (!ctx.allowDebugCommands) return reject('DebugGiveItems', 'not-allowed');
      if (!addItems(state.inventory, cmd.items, ctx.items)) return reject('DebugGiveItems', 'inventory-full');
      return [{ type: 'ItemsGained', items: cmd.items, source: 'debug' }];
    case 'DebugSetClock':
      if (!ctx.allowDebugCommands) return reject('DebugSetClock', 'not-allowed');
      if (!validHour(cmd.hour)) return reject('DebugSetClock', 'invalid-command');
      return skipToHour(state, cmd.hour, ctx);
    case 'DebugSetMistStage':
      if (!ctx.allowDebugCommands) return reject('DebugSetMistStage', 'not-allowed');
      if (state.mist[cmd.region] === cmd.stage) return [];
      return [{ type: 'MistStageChanged', region: cmd.region, stage: cmd.stage }];
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
  if (spec.quest) {
    const quest = ctx.quests.get(spec.quest);
    if (!quest || questStatus(state, quest) !== 'active') return reject('HarvestObject', 'quest-unavailable', placementId);
  }
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
  const contents = found.prefab.contents;
  if (!contents) return [{ type: 'ChestOpened', placementId }];
  // 背包放不下時寶箱保持關閉，獎勵不會遺失
  const items = rollIntoInventory(state, contents.lootTableId, ctx);
  if (!items) return reject('OpenChest', 'inventory-full', placementId);
  const events: GameEvent[] = [
    { type: 'ChestOpened', placementId },
    { type: 'ItemsGained', items, source: placementId },
  ];
  if (contents.unlocksCompanion && !state.companion.unlocked) events.push({ type: 'CompanionUnlocked' });
  const started = contents.startsQuest ? ctx.quests.get(contents.startsQuest) : undefined;
  if (started && questStatus(state, started) === 'available') events.push({ type: 'QuestAccepted', quest: started.id });
  return events;
}

function repairObject(state: GameState, placementId: string, ctx: RulesContext): GameEvent[] {
  const found = lookup(ctx, placementId);
  if (!found) return reject('RepairObject', 'unknown-object', placementId);
  const spec = found.prefab.repair;
  if (found.prefab.interaction !== 'repair' || !spec) return reject('RepairObject', 'wrong-interaction', placementId);
  if (state.objects.get(placementId)?.repaired) return reject('RepairObject', 'already-repaired', placementId);
  // 規格 5.2：木橋只在修復任務進行中可互動
  if (spec.quest) {
    const quest = ctx.quests.get(spec.quest);
    if (!quest || questStatus(state, quest) !== 'active') return reject('RepairObject', 'quest-unavailable', placementId);
    if (spec.ordered && !earlierObjectivesDone(state, quest, placementId)) return reject('RepairObject', 'out-of-order', placementId);
  }
  if (!removeItems(state.inventory, spec.materials)) return reject('RepairObject', 'missing-materials', placementId);
  return [
    { type: 'ItemsRemoved', items: spec.materials, reason: 'repair' },
    { type: 'ObjectRepaired', placementId },
  ];
}

function activateObject(state: GameState, placementId: string, ctx: RulesContext): GameEvent[] {
  const found = lookup(ctx, placementId);
  if (!found) return reject('ActivateObject', 'unknown-object', placementId);
  const spec = found.prefab.activate;
  if (found.prefab.interaction !== 'activate' || !spec) return reject('ActivateObject', 'wrong-interaction', placementId);
  if (state.objects.get(placementId)?.active) return reject('ActivateObject', 'already-active', placementId);
  if (spec.quest) {
    const quest = ctx.quests.get(spec.quest);
    if (!quest || questStatus(state, quest) !== 'active') return reject('ActivateObject', 'quest-unavailable', placementId);
    if (spec.ordered && !earlierObjectivesDone(state, quest, placementId)) return reject('ActivateObject', 'out-of-order', placementId);
  }
  // 頭目戰場的水槽：只有戰鬥中才能注水（任務 8D）
  if (spec.boss && bossEnemies(state, spec.boss).length === 0) return reject('ActivateObject', 'not-in-fight', placementId);
  // 森林根源石：守衛平靜下來之前碰不到（任務 8D-2）
  if (spec.afterBoss && !state.defeatedBosses.includes(spec.afterBoss)) return reject('ActivateObject', 'boss-not-defeated', placementId);
  // 調查開始任務（任務 7L）：任務必須可以接
  let started: QuestDef | undefined;
  if (spec.startsQuest) {
    started = ctx.quests.get(spec.startsQuest);
    if (!started || questStatus(state, started) !== 'available') return reject('ActivateObject', 'quest-unavailable', placementId);
  }
  // 另一個物件啟動一段時間後才能啟動（放下野果、離開一陣子再回來）
  if (spec.after) {
    const at = state.objects.get(spec.after.placement)?.activatedAt;
    if (at === undefined || state.time - at < spec.after.seconds) return reject('ActivateObject', 'too-soon', placementId);
  }
  if (spec.consume && !removeItems(state.inventory, spec.consume)) return reject('ActivateObject', 'missing-materials', placementId);
  const events: GameEvent[] = [{ type: 'ObjectActivated', placementId, source: 'player' }];
  if (spec.consume) events.unshift({ type: 'ItemsRemoved', items: spec.consume.map((c) => ({ ...c })), reason: 'quest' });
  if (started) events.push({ type: 'QuestAccepted', quest: started.id });
  if (spec.lootTableId) {
    // 背包放不下時不能啟動（物品不會遺失）
    const items = rollIntoInventory(state, spec.lootTableId, ctx);
    if (!items) return reject('ActivateObject', 'inventory-full', placementId);
    if (items.length > 0) events.push({ type: 'ItemsGained', items, source: placementId });
  }
  return events;
}

function turnObject(state: GameState, placementId: string, ctx: RulesContext): GameEvent[] {
  const found = lookup(ctx, placementId);
  if (!found) return reject('TurnObject', 'unknown-object', placementId);
  const spec = found.prefab.turn;
  if (found.prefab.interaction !== 'turn' || !spec) return reject('TurnObject', 'wrong-interaction', placementId);
  const turn = ((state.objects.get(placementId)?.turn ?? 0) + 1) % spec.positions;
  return [{ type: 'ObjectTurned', placementId, turn }];
}

/**
 * 水道（任務 8C）：機關改變後重新計算水流；水流到還沒喚醒的苔蘚節點時一併送出啟動事件。
 * 指令被拒絕時不加任何事件。
 */
function withWater(state: GameState, events: GameEvent[], ctx: RulesContext): GameEvent[] {
  if (!ctx.waterways?.length || events.some((e) => e.type === 'CommandRejected')) return events;
  const next = applyEvents(state, events, ctx);
  for (const placementId of outletsToWake(ctx.waterways, next.objects)) events.push({ type: 'ObjectActivated', placementId, source: 'water' });
  return events;
}

/** 招式的傷害：近戰招式必須屬於目前裝備的武器 */
function attackDamage(state: GameState, attack: string, ctx: RulesContext): number | RejectReason {
  const spell = ctx.spells.get(attack);
  if (spell) return spell.damage;
  const entry = ctx.weapons.moves.get(attack);
  if (!entry) return 'unknown-move';
  if (entry.weapon !== state.player.weapon) return 'weapon-not-equipped';
  return entry.move.damage;
}

function attackEnemy(state: GameState, enemyId: string, attack: string, ctx: RulesContext, stance?: EnemyStance): GameEvent[] {
  if (state.player.defeated) return reject('AttackEnemy', 'player-defeated');
  const enemy = state.enemies.get(enemyId);
  const def = enemy && ctx.combat.enemies.get(enemy.kind);
  if (!enemy || !def) return reject('AttackEnemy', 'unknown-enemy');
  const base = attackDamage(state, attack, ctx);
  if (typeof base === 'string') return reject('AttackEnemy', base);
  // 根鬚甲蟲縮殼時減傷、出手後的破綻時加傷（其他敵人的姿態倍率一律為 1）；頭目另有迷霧護盾
  const boss = def.boss;
  const filled = boss ? filledTroughs(state, boss) : 0;
  const shield = boss ? bossShieldScale(boss, filled) : 1;
  const amount = Math.round(base * stanceDamageScale(def, stance) * shield);
  // 水槽還沒全部注水前，迷霧把傷口補回去：頭目打不倒（Bible §6.5 戰鬥提示）
  const floor = boss && filled < boss.troughs.length ? 1 : 0;
  const hp = Math.max(floor, enemy.hp - amount);
  const events: GameEvent[] = [{ type: 'EnemyDamaged', enemyId, amount: boss ? enemy.hp - hp : amount, hp, attack }];
  if (hp > 0) return events;

  events.push({ type: 'EnemyDefeated', enemyId, kind: enemy.kind, spawner: enemy.spawner });
  if (boss) events.push({ type: 'BossDefeated', boss: enemy.kind });
  // 水泡精（任務 9B）：被打破時分裂成幾個小水滴（id 接在原本的後面，本機在原地生成）
  const child = def.splitInto && ctx.combat.enemies.get(def.splitInto.enemy);
  if (def.splitInto && child) {
    for (let k = 1; k <= def.splitInto.count; k++) events.push({ type: 'EnemySpawned', enemyId: `${enemyId}~${k}`, kind: child.id, spawner: enemy.spawner, hp: child.maxHp });
  }
  const spawner = ctx.combat.spawners.find((s) => s.id === enemy.spawner);
  if (spawner && !spawner.manual) events.push({ type: 'SpawnerCooldown', spawner: spawner.id, nextSpawnAt: state.time + spawner.respawnSec });
  // 掉落：背包放不下時不掉（不影響擊敗）
  if (def.lootTableId) {
    const items = rollIntoInventory(state, def.lootTableId, ctx);
    if (items && items.length > 0) events.push({ type: 'ItemsGained', items, source: enemyId });
  }
  // 任務進度：進行中任務的擊敗目標；達到里程碑時改變區域迷霧（規格 1.4：擊殺迷霧生物會降低迷霧）
  for (const [questId, record] of Object.entries(state.quests)) {
    if (record.status !== 'active') continue;
    const quest = ctx.quests.get(questId);
    quest?.objectives.forEach((o, i) => {
      if (o.type !== 'defeat' || o.enemy !== enemy.kind) return;
      const before = record.progress?.[i] ?? 0;
      if (before >= o.count) return;
      const count = before + 1;
      events.push({ type: 'QuestProgressed', quest: questId, objective: i, count });
      for (const m of o.milestones ?? []) {
        if (m.count === count && state.mist[m.region] !== m.stage) events.push({ type: 'MistStageChanged', region: m.region, stage: m.stage });
      }
    });
  }
  return events;
}

function enemyStrike(state: GameState, enemyId: string, ctx: RulesContext, spit: boolean, move?: BossMoveId): GameEvent[] {
  const enemy = state.enemies.get(enemyId);
  const def = enemy && ctx.combat.enemies.get(enemy.kind);
  if (!enemy || !def) return reject('EnemyStrike', 'unknown-enemy');
  if (state.player.defeated) return reject('EnemyStrike', 'player-defeated');
  const behavior = def.behavior;
  if (spit && behavior?.kind !== 'spit') return reject('EnemyStrike', 'invalid-command');
  // 頭目只用招式攻擊，一般敵人不能帶招式
  if ((move !== undefined) !== Boolean(def.boss)) return reject('EnemyStrike', 'invalid-command');
  const bossMove = move && def.boss ? def.boss.moves[move] : undefined;
  if (move && !bossMove) return reject('EnemyStrike', 'invalid-command');
  const amount = bossMove ? bossMove.damage : spit && behavior?.kind === 'spit' ? behavior.damage : def.damage;
  const hp = Math.max(0, state.player.hp - amount);
  const events: GameEvent[] = [{ type: 'PlayerDamaged', amount, hp, enemyId }];
  if (spit && behavior?.kind === 'spit' && hp > 0) events.push({ type: 'PlayerSlowed', sec: behavior.slowSec, scale: behavior.slowScale });
  // 睡眠孢子：昏昏欲睡，一段時間內走得很慢
  const spores = def.boss?.moves.spores;
  if (move === 'spores' && spores && hp > 0) events.push({ type: 'PlayerSlowed', sec: spores.slowSec, scale: spores.slowScale, cause: 'spores' });
  if (hp <= 0) {
    events.push({ type: 'PlayerDefeated' });
    // 失敗後重試（Bible §27.4）：頭目回去、血量回滿，已注水的水槽保留
    for (const e of state.enemies.values()) if (ctx.combat.enemies.get(e.kind)?.boss) events.push({ type: 'EnemyDespawned', enemyId: e.id });
  }
  return events;
}

/** 正在戰鬥中的這個頭目（通常 0 或 1 隻） */
function bossEnemies(state: GameState, bossId: string): EnemyRuntime[] {
  return [...state.enemies.values()].filter((e) => e.kind === bossId);
}

/** 已注水的水槽數 */
export function filledTroughs(state: Pick<GameState, 'objects'>, boss: BossDef): number {
  return boss.troughs.filter((id) => state.objects.get(id)?.active).length;
}

function startBossFight(state: GameState, bossId: string, ctx: RulesContext): GameEvent[] {
  const def = ctx.combat.enemies.get(bossId);
  const spawner = bossSpawner(ctx.combat, bossId);
  if (!def?.boss || !spawner) return reject('StartBossFight', 'unknown-enemy');
  if (state.player.defeated) return reject('StartBossFight', 'player-defeated');
  if (state.defeatedBosses.includes(bossId)) return reject('StartBossFight', 'already-defeated');
  if (bossEnemies(state, bossId).length > 0) return reject('StartBossFight', 'already-active');
  if (!bossRequirementsMet(def.boss, state.quests)) return reject('StartBossFight', 'quest-unavailable');
  const counter = (state.spawners[spawner.id]?.counter ?? 0) + 1;
  return [{ type: 'EnemySpawned', enemyId: `${spawner.id}#${counter}`, kind: bossId, spawner: spawner.id, hp: def.maxHp }];
}

/** 生成點補充與收回（規格 1.4：生成率依區域迷霧；迷霧變淡時多出來的迷霧生物消散） */
function spawnerEvents(state: GameState, time: number, ctx: RulesContext): GameEvent[] {
  const events: GameEvent[] = [];
  for (const spawner of ctx.combat.spawners) {
    if (spawner.manual) continue;
    const budget = spawner.budget[state.mist[spawner.regionId]];
    // 分裂出來的小水滴（種類不同）不佔數量，也不會因為數量超過而消散
    const alive = [...state.enemies.values()].filter((e) => e.spawner === spawner.id && e.kind === spawner.enemy);
    for (const extra of alive.slice(budget)) events.push({ type: 'EnemyDespawned', enemyId: extra.id });
    const runtime = state.spawners[spawner.id];
    if (alive.length >= budget || (runtime && time < runtime.nextSpawnAt)) continue;
    const def = ctx.combat.enemies.get(spawner.enemy);
    if (!def) continue;
    const counter = (runtime?.counter ?? 0) + 1;
    events.push({ type: 'EnemySpawned', enemyId: `${spawner.id}#${counter}`, kind: def.id, spawner: spawner.id, hp: def.maxHp });
    // 一次補一隻，下一隻間隔幾秒，避免同時冒出一群
    events.push({ type: 'SpawnerCooldown', spawner: spawner.id, nextSpawnAt: time + 3 });
  }
  return events;
}

function placeBuilding(state: GameState, cmd: Extract<GameCommand, { type: 'PlaceBuilding' }>, ctx: RulesContext): GameEvent[] {
  const def = ctx.buildables.get(cmd.buildable);
  if (!def) return reject('PlaceBuilding', 'unknown-buildable');
  if (![cmd.x, cmd.z, cmd.yaw].every(Number.isFinite)) return reject('PlaceBuilding', 'invalid-command');
  const at = { x: snapToGrid(cmd.x), z: snapToGrid(cmd.z) };
  if (!isBuildableUnlocked(def, state.quests)) return reject('PlaceBuilding', 'recipe-locked');
  const problem = placementProblem(def, at, state.buildings, ctx.buildables, state.inventory, ctx.isOccupied ?? (() => false));
  if (problem) return reject('PlaceBuilding', problem);
  const building: Building = { id: `building_${state.nextBuildingId}`, buildable: def.id, ...at, yaw: snapYaw(cmd.yaw), ...(def.growth ? { placedAt: state.time } : {}) };
  return [{ type: 'BuildingPlaced', building, cost: def.cost.map((c) => ({ ...c })) }];
}

/** 玩家是否在自己蓋的營火旁 */
export function nearCampfire(state: Pick<GameState, 'buildings'>, at: { x: number; z: number }): boolean {
  return state.buildings.some((b) => b.buildable === 'campfire' && Math.hypot(b.x - at.x, b.z - at.z) <= PLAYER_STATS.campfire.radius);
}

function acceptQuest(state: GameState, questId: string, ctx: RulesContext): GameEvent[] {
  const def = ctx.quests.get(questId);
  if (!def) return reject('AcceptQuest', 'unknown-quest');
  if (questStatus(state, def) !== 'available') return reject('AcceptQuest', 'quest-unavailable');
  const start = def.start?.items ?? [];
  // 接取時拿到的物品（要送的信）放不下時不能接
  if (start.length > 0 && !addItems(state.inventory, start, ctx.items)) return reject('AcceptQuest', 'inventory-full');
  const events: GameEvent[] = [{ type: 'QuestAccepted', quest: questId }];
  if (start.length > 0) events.push({ type: 'ItemsGained', items: start, source: `quest:${questId}` });
  // 已經追蹤滿了：新接的支線先不追蹤（可在任務日誌切換）
  if (def.category !== 'main' && trackedSideCount(state.quests, ctx.quests) >= MAX_TRACKED_SIDE) events.push({ type: 'QuestTracked', quest: questId, tracked: false });
  return events;
}

function craft(state: GameState, recipeId: string, ctx: RulesContext): GameEvent[] {
  const recipe = ctx.crafting?.recipes.find((r) => r.id === recipeId);
  if (!recipe) return reject('Craft', 'invalid-command');
  if (recipe.requires && state.quests[recipe.requires.questCompleted]?.status !== 'completed') return reject('Craft', 'recipe-locked');
  const afterUse = removeItems(state.inventory, recipe.inputs);
  if (!afterUse) return reject('Craft', 'missing-materials');
  const output = [{ ...recipe.output }];
  if (!addItems(afterUse, output, ctx.items)) return reject('Craft', 'inventory-full');
  return [
    { type: 'ItemsRemoved', items: recipe.inputs.map((i) => ({ ...i })), reason: 'craft' },
    { type: 'ItemsGained', items: output, source: `craft:${recipe.id}` },
  ];
}

function consumeItem(state: GameState, itemId: string, ctx: RulesContext): GameEvent[] {
  const use = ctx.items.get(itemId)?.use;
  if (!use) return reject('UseItem', 'not-usable');
  if (state.player.defeated) return reject('UseItem', 'player-defeated');
  // 體力已滿時只回血的藥不能用（避免浪費）；能解除緩速的藥膏照樣可以用
  if (state.player.hp >= PLAYER_STATS.maxHp && !use.cureSlow) return reject('UseItem', 'hp-full');
  const items = [{ itemId, count: 1 }];
  if (!removeItems(state.inventory, items)) return reject('UseItem', 'missing-materials');
  const events: GameEvent[] = [
    { type: 'ItemsRemoved', items, reason: 'use' },
    { type: 'PlayerHealed', hp: Math.min(PLAYER_STATS.maxHp, state.player.hp + use.heal) },
  ];
  if (use.cureSlow) events.push({ type: 'PlayerSlowCured' });
  return events;
}

function tradeCount(count: number): boolean {
  return Number.isInteger(count) && count >= 1 && count <= MAX_TRADE;
}

function buyItem(state: GameState, cmd: Extract<GameCommand, { type: 'BuyItem' }>, ctx: RulesContext): GameEvent[] {
  const shop = ctx.shops?.get(cmd.shop);
  if (!shop) return reject('BuyItem', 'invalid-command');
  if (!tradeCount(cmd.count)) return reject('BuyItem', 'invalid-command');
  const entry = availableStock(shop, state.quests).find((s) => s.itemId === cmd.itemId);
  if (!entry) return reject('BuyItem', 'not-for-sale');
  const cost = [{ itemId: COIN, count: entry.price * cmd.count }];
  const afterPay = removeItems(state.inventory, cost);
  if (!afterPay) return reject('BuyItem', 'not-enough-coins');
  const items = [{ itemId: cmd.itemId, count: cmd.count }];
  if (!addItems(afterPay, items, ctx.items)) return reject('BuyItem', 'inventory-full');
  return [
    { type: 'ItemsRemoved', items: cost, reason: 'shop' },
    { type: 'ItemsGained', items, source: `shop:${shop.id}` },
  ];
}

function sellItem(state: GameState, cmd: Extract<GameCommand, { type: 'SellItem' }>, ctx: RulesContext): GameEvent[] {
  const shop = ctx.shops?.get(cmd.shop);
  if (!shop) return reject('SellItem', 'invalid-command');
  if (!tradeCount(cmd.count)) return reject('SellItem', 'invalid-command');
  const entry = shop.buys.find((b) => b.itemId === cmd.itemId);
  if (!entry) return reject('SellItem', 'not-for-sale');
  const items = [{ itemId: cmd.itemId, count: cmd.count }];
  const afterSell = removeItems(state.inventory, items);
  if (!afterSell) return reject('SellItem', 'missing-materials');
  const coins = [{ itemId: COIN, count: entry.price * cmd.count }];
  if (!addItems(afterSell, coins, ctx.items)) return reject('SellItem', 'inventory-full');
  return [
    { type: 'ItemsRemoved', items, reason: 'shop' },
    { type: 'ItemsGained', items: coins, source: `shop:${shop.id}` },
  ];
}

/** 走到任務指定的地方（任務 7O）：進行中任務裡還沒完成的 visit 目標 */
function visitEvents(state: GameState, x: number, z: number, ctx: RulesContext): GameEvent[] {
  const events: GameEvent[] = [];
  for (const [questId, record] of Object.entries(state.quests)) {
    if (record.status !== 'active') continue;
    ctx.quests.get(questId)?.objectives.forEach((o, i) => {
      if (o.type !== 'visit' || (record.progress?.[i] ?? 0) > 0) return;
      if (Math.hypot(x - o.x, z - o.z) <= o.radius) events.push({ type: 'QuestProgressed', quest: questId, objective: i, count: 1 });
    });
  }
  return events;
}

function questTalk(state: GameState, questId: string, npc: string, ctx: RulesContext): GameEvent[] {
  const def = ctx.quests.get(questId);
  if (!def) return reject('QuestTalk', 'unknown-quest');
  if (questStatus(state, def) !== 'active') return reject('QuestTalk', 'quest-unavailable');
  const index = talkObjectiveIndex(def, npc);
  const objective = def.objectives[index];
  if (!objective || objective.type !== 'talk') return reject('QuestTalk', 'invalid-command');
  const record = state.quests[questId];
  if ((record?.progress?.[index] ?? 0) > 0) return reject('QuestTalk', 'already-active');
  const events: GameEvent[] = [];
  if (objective.item) {
    const items = [{ itemId: objective.item, count: 1 }];
    if (!removeItems(state.inventory, items)) return reject('QuestTalk', 'missing-materials');
    events.push({ type: 'ItemsRemoved', items, reason: 'quest' });
  }
  events.push({ type: 'QuestProgressed', quest: questId, objective: index, count: talksDone(record, def) + 1 });
  return events;
}

function turnInQuest(state: GameState, questId: string, ctx: RulesContext): GameEvent[] {
  const def = ctx.quests.get(questId);
  if (!def) return reject('TurnInQuest', 'unknown-quest');
  if (questStatus(state, def) !== 'active') return reject('TurnInQuest', 'quest-unavailable');
  if (!isQuestReady(state, def)) return reject('TurnInQuest', 'quest-incomplete');
  // 先交出物品再放入獎勵，檢查背包放得下（放不下時任務維持進行中，物品不會被拿走）
  const consumed = questConsumption(def);
  const afterConsume = removeItems(state.inventory, consumed);
  if (!afterConsume) return reject('TurnInQuest', 'quest-incomplete');
  const rewards = def.rewards.items ?? [];
  if (rewards.length > 0 && !addItems(afterConsume, rewards, ctx.items)) return reject('TurnInQuest', 'inventory-full');
  const events: GameEvent[] = [];
  if (consumed.length > 0) events.push({ type: 'ItemsRemoved', items: consumed, reason: 'quest' });
  events.push({ type: 'QuestCompleted', quest: questId });
  if (rewards.length > 0) events.push({ type: 'ItemsGained', items: rewards, source: `quest:${questId}` });
  for (const m of def.rewards.mist ?? []) {
    if (state.mist[m.region] !== m.stage) events.push({ type: 'MistStageChanged', region: m.region, stage: m.stage });
  }
  for (const placementId of def.rewards.objects ?? []) {
    if (!state.objects.get(placementId)?.active) events.push({ type: 'ObjectActivated', placementId, source: 'quest' });
  }
  return events;
}

function validHour(hour: number): boolean {
  return Number.isFinite(hour) && hour >= 0 && hour < 24;
}

/** 時間往前推進到下一個 hour 時刻：與一般的時間前進相同（物件重生、回血、生成都照常結算） */
function skipToHour(state: GameState, hour: number, ctx: RulesContext): GameEvent[] {
  const dt = secondsUntilHour(state.time, hour);
  return dt > 0 ? advanceTime(state, { type: 'AdvanceTime', dt }, ctx) : [];
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
  // 脫離戰鬥一段時間後回血；在自己蓋的營火旁回得更快（規格 6.7：建造物的簡單效果）
  const { player } = state;
  const cozy = cmd.player !== undefined && nearCampfire(state, cmd.player);
  const regen = cozy ? PLAYER_STATS.campfire : PLAYER_STATS;
  if (!player.defeated && player.hp < PLAYER_STATS.maxHp && time - player.lastDamagedAt >= regen.regenDelay) {
    events.push({ type: 'PlayerHealed', hp: Math.min(PLAYER_STATS.maxHp, player.hp + regen.regenPerSec * cmd.dt) });
  }
  // 星光值隨時間回復（GAME_DESIGN 5.4）
  if (player.mp < MAX_MP) events.push({ type: 'MpChanged', mp: regenMp(player.mp, cmd.dt) });
  events.push(...spawnerEvents(state, time, ctx));
  return events;
}

/** 套用事件，回傳新狀態（不修改輸入）。沒有物件事件時保留原本的 objects 參照，讓 selector 不必重新計算。 */
export function applyEvents(state: GameState, events: readonly GameEvent[], ctx: Pick<RulesContext, 'items'>): GameState {
  let { time, objects, inventory, tutorial, mist, quests, player, enemies, spawners, companion, buildings, nextBuildingId, explored, defeatedBosses } = state;
  let nextEnemies: Map<string, EnemyRuntime> | null = null;
  const mutableEnemies = () => (nextEnemies ??= new Map(enemies));
  let nextObjects: Map<string, ObjectRuntime> | null = null;
  const mutableObjects = () => (nextObjects ??= new Map(objects));
  const patch = (id: string, change: Partial<ObjectRuntime>) => {
    const map = mutableObjects();
    const merged: ObjectRuntime = { ...(map.get(id) ?? { placementId: id }), ...change };
    // 回到預設狀態的物件從表中移除，存檔只記錄差異
    if (!merged.open && !merged.harvested && !merged.repaired && !merged.active && !merged.turn && merged.respawnAt === undefined && merged.hp === undefined && merged.activatedAt === undefined) map.delete(id);
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
      case 'ObjectRepaired':
        patch(e.placementId, { repaired: true });
        break;
      case 'ObjectActivated':
        patch(e.placementId, { active: true, activatedAt: time });
        break;
      case 'ObjectTurned':
        patch(e.placementId, { turn: e.turn || undefined });
        break;
      case 'ItemsGained': {
        const next = addItems(inventory, e.items, ctx.items);
        // 規則已檢查過容量；走到這裡代表事件與狀態不一致，必須明確失敗
        if (!next) throw new Error('ItemsGained 事件無法放入背包（事件與狀態不一致）');
        inventory = next;
        break;
      }
      case 'TutorialAdvanced':
        tutorial = e.step;
        break;
      case 'MistStageChanged':
        mist = { ...mist, [e.region]: e.stage };
        break;
      case 'QuestAccepted':
        quests = { ...quests, [e.quest]: { status: 'active' } };
        break;
      case 'QuestCompleted':
        quests = { ...quests, [e.quest]: { status: 'completed' } };
        break;
      case 'QuestTracked': {
        const record = quests[e.quest];
        if (!record) break;
        const next: QuestRecord = { ...record };
        if (e.tracked) delete next.untracked;
        else next.untracked = true;
        quests = { ...quests, [e.quest]: next };
        break;
      }
      case 'QuestProgressed': {
        const record = quests[e.quest];
        if (!record) break;
        const progress = [...(record.progress ?? [])];
        progress[e.objective] = e.count;
        quests = { ...quests, [e.quest]: { ...record, progress: Array.from(progress, (v) => v ?? 0) } };
        break;
      }
      case 'EnemySpawned':
        mutableEnemies().set(e.enemyId, { id: e.enemyId, kind: e.kind, spawner: e.spawner, hp: e.hp });
        spawners = { ...spawners, [e.spawner]: { nextSpawnAt: spawners[e.spawner]?.nextSpawnAt ?? 0, counter: (spawners[e.spawner]?.counter ?? 0) + 1 } };
        break;
      case 'EnemyDespawned':
      case 'EnemyDefeated':
        mutableEnemies().delete(e.enemyId);
        break;
      case 'EnemyDamaged': {
        const enemy = mutableEnemies().get(e.enemyId);
        if (enemy) mutableEnemies().set(e.enemyId, { ...enemy, hp: e.hp });
        break;
      }
      case 'SpawnerCooldown':
        spawners = { ...spawners, [e.spawner]: { counter: spawners[e.spawner]?.counter ?? 0, nextSpawnAt: e.nextSpawnAt } };
        break;
      case 'PlayerDamaged':
        player = { ...player, hp: e.hp, lastDamagedAt: time };
        break;
      case 'PlayerHealed':
        player = { ...player, hp: e.hp };
        break;
      case 'PlayerDefeated':
        player = { ...player, hp: 0, defeated: true };
        break;
      case 'PlayerRespawned':
        player = { ...player, hp: e.hp, lastDamagedAt: time, defeated: false };
        break;
      case 'CompanionUnlocked':
        companion = { unlocked: true };
        break;
      case 'WeaponEquipped':
        player = { ...player, weapon: e.weapon };
        break;
      case 'SpellCast':
      case 'MpChanged':
        player = { ...player, mp: e.mp };
        break;
      case 'BuildingPlaced': {
        const next = removeItems(inventory, e.cost);
        if (!next) throw new Error('BuildingPlaced 事件的材料超過持有數量（事件與狀態不一致）');
        inventory = next;
        buildings = [...buildings, e.building];
        nextBuildingId += 1;
        break;
      }
      case 'BuildingRemoved':
        buildings = buildings.filter((b) => b.id !== e.buildingId);
        break;
      case 'ItemsRemoved': {
        const next = removeItems(inventory, e.items);
        if (!next) throw new Error('ItemsRemoved 事件超過持有數量（事件與狀態不一致）');
        inventory = next;
        break;
      }
      case 'AreaExplored':
        explored = withCells(explored, e.cells);
        break;
      case 'BossDefeated':
        if (!defeatedBosses.includes(e.boss)) defeatedBosses = [...defeatedBosses, e.boss];
        break;
      case 'CommandRejected':
        break;
    }
  }
  if (nextObjects) objects = nextObjects;
  if (nextEnemies) enemies = nextEnemies;
  return { time, objects, inventory, tutorial, mist, quests, player, enemies, spawners, companion, buildings, nextBuildingId, explored, defeatedBosses };
}
