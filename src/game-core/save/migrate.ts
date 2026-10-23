// 存檔版本遷移：每個舊版本一個函式，把資料升一版，依序套用到最新版。
import { PLAYER_STATS } from '../combat/combat';
import { DEFAULT_WEAPON } from '../combat/weapons';
import { DEFAULT_HERO_CLASS } from '../character/heroClass';
import { MAX_MP } from '../combat/spells';
import { createExplored, decodeExplored, encodeExplored } from '../map/explore';
import { initialMistStages } from '../world/regions';
import { GLOWMOSS_ARRIVAL, GLOWMOSS_ORIGIN, glowmossHeight, isInGlowmoss } from '../world/glowmossTerrain';
import { SAVE_VERSION } from './schema';

export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

export class SaveFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveFormatError';
  }
}

/** key = 來源版本，函式把 v 版資料轉成 v + 1 版。每個遷移都要有測試（save.test.ts）。 */
export const saveMigrations: Readonly<Record<number, Migration>> = {
  // v1 → v2：加入教學進度。v1 存檔建立時還沒有教學，玩家已經在玩，視為已完成，不再從頭提示
  1: (data) => ({ ...data, tutorial: 'done' }),
  // v2 → v3：加入各區域迷霧。v2 時還沒有任何會改變迷霧的任務，所以就是新遊戲的初始值
  2: (data) => ({ ...data, mist: { ...initialMistStages } }),
  // v3 → v4：加入任務紀錄；v3 時還沒有任務系統，沒有接過任何任務
  3: (data) => ({ ...data, quests: {} }),
  // v4 → v5：加入戰鬥狀態；v4 時沒有戰鬥，滿血、沒有敵人（讀檔後由生成點補上）
  4: (data) => ({ ...data, combat: { hp: PLAYER_STATS.maxHp, enemies: [], spawners: {} } }),
  // v5 → v6：加入星光夥伴。夥伴從出生草原的寶箱飛出來，已經打開那個寶箱的存檔直接解鎖
  5: (data) => ({ ...data, companion: { unlocked: openedCompanionChest(data) } }),
  // v6 → v7：加入建造；v6 時還不能建造
  6: (data) => ({ ...data, build: { buildings: [], nextBuildingId: 1 } }),
  // v7 → v8：加入裝備（近戰武器，GAME_DESIGN 5.3）；v7 的攻擊是單手武器揮砍，對應預設的單手劍
  7: (data) => ({ ...data, loadout: { weapon: DEFAULT_WEAPON } }),
  // v8 → v9：加入星光值（魔法，GAME_DESIGN 5.4）；v8 時還沒有魔法，給滿
  8: (data) => ({ ...data, combat: { ...(data.combat as Record<string, unknown>), mp: MAX_MP } }),
  // v9 → v10：地圖擴大（任務 7A）新增高地、農田、溪流區域；既有區域的迷霧保留，缺少的補上新遊戲的初始值
  9: (data) => ({ ...data, mist: { ...initialMistStages, ...(data.mist as Record<string, unknown>) } }),
  // v10 → v11：加入世界地圖的探索紀錄（任務 7B）；舊存檔從空白開始，讀檔後玩家附近立刻標為已探索
  10: (data) => ({ ...data, map: { explored: encodeExplored(createExplored()) } }),
  // v11 → v12：加入螢苔祕林（任務 8A）的區域迷霧（補上新遊戲的初始值）；探索紀錄在後面接上新地圖的空白格子
  11: (data) => {
    const map = data.map as { explored?: unknown } | undefined;
    const old = typeof map?.explored === 'string' ? decodeExplored(map.explored) : null;
    return {
      ...data,
      mist: { ...initialMistStages, ...(data.mist as Record<string, unknown>) },
      map: { ...map, explored: encodeExplored(old ?? createExplored()) },
    };
  },
  // v12 → v13：世界物件多了機關的開關與水輪位置（任務 8C）；都是選填欄位，舊存檔的內容不必改
  12: (data) => data,
  // v13 → v14：加入已擊敗的頭目（任務 8D）；舊存檔還沒有頭目戰
  13: (data) => ({ ...data, combat: { ...(data.combat as Record<string, unknown>), defeatedBosses: [] } }),
  // v14 → v15：加入澄鏡湖（任務 9A）的區域迷霧；探索紀錄在後面接上新地圖的空白格子（同 v11 → v12）
  14: (data) => {
    const map = data.map as { explored?: unknown } | undefined;
    const old = typeof map?.explored === 'string' ? decodeExplored(map.explored) : null;
    return {
      ...data,
      mist: { ...initialMistStages, ...(data.mist as Record<string, unknown>) },
      map: { ...map, explored: encodeExplored(old ?? createExplored()) },
    };
  },
  // v15 → v16：加入風語草原（任務 9F）的區域迷霧；探索紀錄接上第四張地圖的空白格子
  15: (data) => {
    const map = data.map as { explored?: unknown } | undefined;
    const old = typeof map?.explored === 'string' ? decodeExplored(map.explored) : null;
    return {
      ...data,
      mist: { ...initialMistStages, ...(data.mist as Record<string, unknown>) },
      map: { ...map, explored: encodeExplored(old ?? createExplored()) },
    };
  },
  // v16 → v17：加入職業（使用者 2026-10-17）；舊存檔是原本唯一的角色星光旅人，武器不變
  16: (data) => ({ ...data, loadout: { ...(data.loadout as Record<string, unknown>), heroClass: DEFAULT_HERO_CLASS } }),
  // v17 → v18：第二章改版（任務 12A，T-185）移除舊版螢苔祕林。任務 id quest_forest_001–003 之後由新主線沿用，
  // 舊紀錄要清掉，否則新任務一開始就是已完成；芽之共鳴改在新主線取得。機關、苔咚與舊生成點一併清掉（讀檔時本來也會略過）。
  17: (data) => {
    const quests = Object.fromEntries(Object.entries((data.quests ?? {}) as Record<string, unknown>).filter(([id]) => !RETIRED_FOREST_QUESTS.has(id)));
    const world = data.world as { objects?: { placementId?: unknown }[] } | undefined;
    const inventory = data.inventory as { slots?: ({ itemId?: unknown } | null)[] } | undefined;
    const combat = data.combat as { defeatedBosses?: unknown[]; spawners?: Record<string, unknown> } | undefined;
    return {
      ...data,
      quests,
      world: { ...world, objects: (world?.objects ?? []).filter((o) => !RETIRED_FOREST_OBJECTS.has(String(o.placementId))) },
      inventory: { ...inventory, slots: (inventory?.slots ?? []).map((s) => (s && s.itemId === 'seed_resonance_bud' ? null : s)) },
      combat: {
        ...combat,
        defeatedBosses: (combat?.defeatedBosses ?? []).filter((id) => id !== 'boss_moss_thump'),
        spawners: Object.fromEntries(Object.entries(combat?.spawners ?? {}).filter(([id]) => !RETIRED_FOREST_SPAWNERS.has(id))),
      },
    };
  },
  // v18 → v19：螢苔祕林換成第二章的新地形與七個區域（任務 12B）。舊的四個區域迷霧拿掉、新區域補上新遊戲的初始值；
  // 站在祕林裡的玩家移到入口（新地形上原本的位置可能是樹或山脊）
  18: (data) => {
    const mist = Object.fromEntries(Object.entries((data.mist ?? {}) as Record<string, unknown>).filter(([id]) => !RETIRED_FOREST_REGIONS.has(id)));
    const player = data.player as { position?: { x?: unknown; y?: unknown; z?: unknown }; facingYaw?: unknown } | undefined;
    const pos = player?.position;
    const inForest = typeof pos?.x === 'number' && typeof pos.z === 'number' && isInGlowmoss(pos.x, pos.z);
    return {
      ...data,
      mist: { ...initialMistStages, ...mist },
      player: inForest
        ? {
            ...player,
            position: {
              x: GLOWMOSS_ORIGIN.x + GLOWMOSS_ARRIVAL.x,
              y: glowmossHeight(GLOWMOSS_ARRIVAL.x, GLOWMOSS_ARRIVAL.z) + 0.1,
              z: GLOWMOSS_ORIGIN.z + GLOWMOSS_ARRIVAL.z,
            },
            // 面向東（走進林子）
            facingYaw: Math.PI / 2,
          }
        : player,
    };
  },
  // v19 → v20：裝備格（第二章 Phase 2，規格 §7.3）。舊存檔沒有裝備；水行護符是被動效果，留在背包裡照常生效
  19: (data) => ({ ...data, loadout: { ...(data.loadout as Record<string, unknown>), equipment: {} } }),
};

/** 任務 12B 換掉的舊版螢苔祕林區域 */
const RETIRED_FOREST_REGIONS: ReadonlySet<string> = new Set(['moss_trail', 'moss_glade', 'root_maze', 'moss_crown']);

/** 任務 12A 移除的舊版螢苔祕林任務、物件與生成點（Bible §6.15） */
const RETIRED_FOREST_QUESTS: ReadonlySet<string> = new Set(['quest_forest_001', 'quest_forest_002', 'quest_forest_003']);
const RETIRED_FOREST_OBJECTS: ReadonlySet<string> = new Set([
  'glowmoss_channel_breach',
  'glowmoss_channel_roots',
  'glowmoss_crown_roots',
  'glowmoss_crown_trough_01',
  'glowmoss_crown_trough_02',
  'glowmoss_crown_trough_03',
  'glowmoss_lake_roots',
  'glowmoss_lake_sign',
  'glowmoss_lantern_01',
  'glowmoss_lantern_02',
  'glowmoss_lantern_03',
  'glowmoss_moss_node_01',
  'glowmoss_moss_node_02',
  'glowmoss_moss_node_03',
  'glowmoss_root_stone',
  'glowmoss_signpost_channel',
  'glowmoss_signpost_crown',
  'glowmoss_water_gate_01',
  'glowmoss_water_gate_02',
  'glowmoss_water_wheel',
]);
const RETIRED_FOREST_SPAWNERS: ReadonlySet<string> = new Set([
  'glade_moths',
  'ring_moths',
  'trail_moths',
  'maze_beetles',
  'channel_beetles',
  'glade_sprouts',
  'maze_sprouts',
  'crown_boss',
  'crescent_sprouts',
]);

/** 序章寶箱（placements.json 的 meadow_chest_001，prefab contents.unlocksCompanion） */
const COMPANION_CHEST = 'meadow_chest_001';

function openedCompanionChest(data: Record<string, unknown>): boolean {
  const world = data.world as { objects?: { placementId?: unknown; open?: unknown }[] } | undefined;
  return world?.objects?.some((o) => o.placementId === COMPANION_CHEST && o.open === true) ?? false;
}

/** 把任何版本的存檔升到 targetVersion。缺版本號、比程式新或缺少遷移函式時拋 SaveFormatError。 */
export function migrateSave(
  raw: unknown,
  migrations: Readonly<Record<number, Migration>> = saveMigrations,
  targetVersion = SAVE_VERSION,
): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SaveFormatError('存檔不是物件');
  let data = raw as Record<string, unknown>;
  const version = data.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) throw new SaveFormatError(`存檔版本號無效：${String(version)}`);
  if (version > targetVersion) throw new SaveFormatError(`存檔版本 ${version} 比遊戲支援的 ${targetVersion} 新`);
  for (let v = version; v < targetVersion; v++) {
    const step = migrations[v];
    if (!step) throw new SaveFormatError(`缺少版本 ${v} → ${v + 1} 的遷移`);
    data = { ...step(data), version: v + 1 };
  }
  return data;
}
