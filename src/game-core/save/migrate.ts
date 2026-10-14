// 存檔版本遷移：每個舊版本一個函式，把資料升一版，依序套用到最新版。
import { PLAYER_STATS } from '../combat/combat';
import { DEFAULT_WEAPON } from '../combat/weapons';
import { MAX_MP } from '../combat/spells';
import { createExplored, decodeExplored, encodeExplored } from '../map/explore';
import { initialMistStages } from '../world/regions';
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
};

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
