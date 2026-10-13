// 權威規則（規格 3.2：指令 → 權威層 → 事件）。
// handleCommand 為純函式：輸入目前狀態、指令與規則所需的資料，輸出事件；狀態只由 applyEvents 推導。
// 單人時由 LocalAuthority 在同一行程呼叫；Phase 6 伺服器可直接重用。
import { placementProblem, refundFor, snapToGrid, snapYaw, type Building, type BuildableCatalog, type PlacementProblem } from '../build/build';
import { PLAYER_STATS, type CombatData } from '../combat/combat';
import { addItems, createInventory, removeItems, type Inventory } from '../inventory/inventory';
import { rollLoot, type ItemCatalog, type ItemStack, type LootTables } from '../items/items';
import { questConsumption, questStatus, isQuestReady, type QuestCatalog, type QuestRecord } from '../quest/quest';
import { nextTutorialStep, type TutorialStep } from '../tutorial/tutorial';
import type { MistStage } from '../world/mist';
import { initialMistStages, type MistStages } from '../world/regions';
import type { RegionId } from '../world/types';
import type { ObjectRuntimeMap, WorldLookup } from '../world/objects';
import type { ObjectRuntime } from '../world/types';

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
  readonly player: { readonly hp: number; readonly lastDamagedAt: number; readonly defeated: boolean };
  /** 目前存在的敵人（位置由本機模擬，權威層只管血量與存在） */
  readonly enemies: ReadonlyMap<string, EnemyRuntime>;
  /** 各生成點下次可以補充敵人的時間與流水號 */
  readonly spawners: Readonly<Record<string, SpawnerRuntime>>;
  /** 星光夥伴（規格 5.2：只持久化解鎖旗標，位置不持久化） */
  readonly companion: { readonly unlocked: boolean };
  /** 已放置的建造物（規格 6.7）與下一個流水號 */
  readonly buildings: readonly Building[];
  readonly nextBuildingId: number;
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
    player: { hp: PLAYER_STATS.maxHp, lastDamagedAt: 0, defeated: false },
    enemies: new Map(),
    spawners: {},
    companion: { unlocked: false },
    buildings: [],
    nextBuildingId: 1,
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
  /** 修復物件（木橋）：消耗材料 */
  | { type: 'RepairObject'; placementId: string }
  /** 玩家攻擊命中敵人（命中判定在本機以 isInAttackArea 計算，規則驗證目標存在並結算傷害） */
  | { type: 'AttackEnemy'; enemyId: string; attack: 'attack' | 'skill' }
  /** 敵人攻擊前搖結束、玩家在攻擊範圍內 */
  | { type: 'EnemyStrike'; enemyId: string }
  /** 倒下後重新站起來 */
  | { type: 'RespawnPlayer' }
  /** 放置建造物（位置與角度由規則吸附到網格）；確認後才扣材料 */
  | { type: 'PlaceBuilding'; buildable: string; x: number; z: number; yaw: number }
  /** 拆除建造物，退還材料 */
  | { type: 'RemoveBuilding'; buildingId: string }
  /** 回報任務：目標全部達成時交出物品、領取獎勵 */
  | { type: 'TurnInQuest'; quest: string }
  /** 除錯 / 美術驗收：直接設定區域的迷霧階段（ctx.allowDebugCommands 為 true 時才接受） */
  | { type: 'DebugSetMistStage'; region: RegionId; stage: MistStage }
  /** 除錯 / 測試：直接放入物品（ctx.allowDebugCommands 為 true 時才接受） */
  | { type: 'DebugGiveItems'; items: ItemStack[] };

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
  | 'missing-materials'
  | 'unknown-enemy'
  | 'player-defeated'
  | 'unknown-buildable'
  | 'unknown-building'
  | PlacementProblem
  | 'not-allowed'
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
  | { type: 'QuestCompleted'; quest: string }
  | { type: 'ItemsRemoved'; items: ItemStack[]; reason: 'quest' | 'repair' }
  | { type: 'ObjectRepaired'; placementId: string }
  | { type: 'EnemySpawned'; enemyId: string; kind: string; spawner: string; hp: number }
  | { type: 'EnemyDespawned'; enemyId: string }
  | { type: 'EnemyDamaged'; enemyId: string; amount: number; hp: number; attack: 'attack' | 'skill' }
  | { type: 'EnemyDefeated'; enemyId: string; kind: string; spawner: string }
  | { type: 'SpawnerCooldown'; spawner: string; nextSpawnAt: number }
  | { type: 'PlayerDamaged'; amount: number; hp: number; enemyId: string }
  | { type: 'PlayerHealed'; hp: number }
  | { type: 'PlayerDefeated' }
  | { type: 'PlayerRespawned'; hp: number }
  | { type: 'QuestProgressed'; quest: string; objective: number; count: number }
  | { type: 'CompanionUnlocked' }
  | { type: 'BuildingPlaced'; building: Building; cost: ItemStack[] }
  | { type: 'BuildingRemoved'; buildingId: string; refund: ItemStack[] }
  | { type: 'CommandRejected'; command: GameCommand['type']; placementId?: string; reason: RejectReason };

/** 規則需要的靜態資料與亂數來源（由呼叫端注入，規則本身不碰全域狀態） */
export type RulesContext = {
  world: WorldLookup;
  items: ItemCatalog;
  lootTables: LootTables;
  random: () => number;
  quests: QuestCatalog;
  combat: CombatData;
  buildables: BuildableCatalog;
  /** 世界靜態物件的佔用查詢（建造檢查用）；省略時視為沒有障礙 */
  isOccupied?: (x: number, z: number, margin: number) => boolean;
  /** 是否接受除錯指令（單人開發 / 測試為 true；日後伺服器為 false） */
  allowDebugCommands?: boolean;
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
    case 'AdvanceTutorial':
      if (cmd.from !== state.tutorial || state.tutorial === 'done') return reject('AdvanceTutorial', 'tutorial-mismatch');
      return [{ type: 'TutorialAdvanced', step: nextTutorialStep(cmd.from) }];
    case 'RepairObject':
      return repairObject(state, cmd.placementId, ctx);
    case 'AttackEnemy':
      return attackEnemy(state, cmd.enemyId, cmd.attack, ctx);
    case 'EnemyStrike':
      return enemyStrike(state, cmd.enemyId, ctx);
    case 'RespawnPlayer':
      if (!state.player.defeated) return reject('RespawnPlayer', 'invalid-command');
      return [{ type: 'PlayerRespawned', hp: PLAYER_STATS.maxHp }];
    case 'PlaceBuilding':
      return placeBuilding(state, cmd, ctx);
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
    case 'TurnInQuest':
      return turnInQuest(state, cmd.quest, ctx);
    case 'DebugGiveItems':
      if (!ctx.allowDebugCommands) return reject('DebugGiveItems', 'not-allowed');
      if (!addItems(state.inventory, cmd.items, ctx.items)) return reject('DebugGiveItems', 'inventory-full');
      return [{ type: 'ItemsGained', items: cmd.items, source: 'debug' }];
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
  }
  if (!removeItems(state.inventory, spec.materials)) return reject('RepairObject', 'missing-materials', placementId);
  return [
    { type: 'ItemsRemoved', items: spec.materials, reason: 'repair' },
    { type: 'ObjectRepaired', placementId },
  ];
}

function attackEnemy(state: GameState, enemyId: string, attack: 'attack' | 'skill', ctx: RulesContext): GameEvent[] {
  if (state.player.defeated) return reject('AttackEnemy', 'player-defeated');
  const enemy = state.enemies.get(enemyId);
  const def = enemy && ctx.combat.enemies.get(enemy.kind);
  if (!enemy || !def) return reject('AttackEnemy', 'unknown-enemy');
  const amount = attack === 'skill' ? PLAYER_STATS.skill.damage : PLAYER_STATS.attack.damage;
  const hp = Math.max(0, enemy.hp - amount);
  const events: GameEvent[] = [{ type: 'EnemyDamaged', enemyId, amount, hp, attack }];
  if (hp > 0) return events;

  events.push({ type: 'EnemyDefeated', enemyId, kind: enemy.kind, spawner: enemy.spawner });
  const spawner = ctx.combat.spawners.find((s) => s.id === enemy.spawner);
  if (spawner) events.push({ type: 'SpawnerCooldown', spawner: spawner.id, nextSpawnAt: state.time + spawner.respawnSec });
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

function enemyStrike(state: GameState, enemyId: string, ctx: RulesContext): GameEvent[] {
  const enemy = state.enemies.get(enemyId);
  const def = enemy && ctx.combat.enemies.get(enemy.kind);
  if (!enemy || !def) return reject('EnemyStrike', 'unknown-enemy');
  if (state.player.defeated) return reject('EnemyStrike', 'player-defeated');
  const hp = Math.max(0, state.player.hp - def.damage);
  const events: GameEvent[] = [{ type: 'PlayerDamaged', amount: def.damage, hp, enemyId }];
  if (hp <= 0) events.push({ type: 'PlayerDefeated' });
  return events;
}

/** 生成點補充與收回（規格 1.4：生成率依區域迷霧；迷霧變淡時多出來的迷霧生物消散） */
function spawnerEvents(state: GameState, time: number, ctx: RulesContext): GameEvent[] {
  const events: GameEvent[] = [];
  for (const spawner of ctx.combat.spawners) {
    const budget = spawner.budget[state.mist[spawner.regionId]];
    const alive = [...state.enemies.values()].filter((e) => e.spawner === spawner.id);
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
  const problem = placementProblem(def, at, state.buildings, ctx.buildables, state.inventory, ctx.isOccupied ?? (() => false));
  if (problem) return reject('PlaceBuilding', problem);
  const building: Building = { id: `building_${state.nextBuildingId}`, buildable: def.id, ...at, yaw: snapYaw(cmd.yaw) };
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
  return [{ type: 'QuestAccepted', quest: questId }];
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
  return events;
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
  events.push(...spawnerEvents(state, time, ctx));
  return events;
}

/** 套用事件，回傳新狀態（不修改輸入）。沒有物件事件時保留原本的 objects 參照，讓 selector 不必重新計算。 */
export function applyEvents(state: GameState, events: readonly GameEvent[], ctx: Pick<RulesContext, 'items'>): GameState {
  let { time, objects, inventory, tutorial, mist, quests, player, enemies, spawners, companion, buildings, nextBuildingId } = state;
  let nextEnemies: Map<string, EnemyRuntime> | null = null;
  const mutableEnemies = () => (nextEnemies ??= new Map(enemies));
  let nextObjects: Map<string, ObjectRuntime> | null = null;
  const mutableObjects = () => (nextObjects ??= new Map(objects));
  const patch = (id: string, change: Partial<ObjectRuntime>) => {
    const map = mutableObjects();
    const merged: ObjectRuntime = { ...(map.get(id) ?? { placementId: id }), ...change };
    // 回到預設狀態的物件從表中移除，存檔只記錄差異
    if (!merged.open && !merged.harvested && !merged.repaired && merged.respawnAt === undefined && merged.hp === undefined) map.delete(id);
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
        player = { hp: e.hp, lastDamagedAt: time, defeated: false };
        break;
      case 'CompanionUnlocked':
        companion = { unlocked: true };
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
      case 'CommandRejected':
        break;
    }
  }
  if (nextObjects) objects = nextObjects;
  if (nextEnemies) enemies = nextEnemies;
  return { time, objects, inventory, tutorial, mist, quests, player, enemies, spawners, companion, buildings, nextBuildingId };
}
