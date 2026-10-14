// 存檔格式（規格 6.8）。只存權威狀態與必要的本機狀態（玩家位置），世界物件只存與預設不同的差異（第 4 層）。
// 每次格式變更：版本號 +1、在 migrate.ts 加入遷移函式與測試。
import { z } from 'zod';
import { tutorialSteps } from '../tutorial/tutorial';
import { mistStagesSchema } from '../world/regions';
import { weaponIds } from '../combat/weapons';

/** v1：Phase 2 第一版。v2：加入教學進度 tutorial。v3：加入各區域迷霧 mist。v4：加入任務 quests。v5：加入戰鬥 combat。v6：加入星光夥伴 companion。v7：加入建造物 buildings。v8：裝備。v9：星光值。v10：地圖擴大後新增的區域迷霧（任務 7A）。v11：世界地圖的探索紀錄（任務 7B） */
export const SAVE_VERSION = 11;

const finite = z.number().refine(Number.isFinite, '必須是有限數值');

export const saveObjectDeltaSchema = z.object({
  placementId: z.string().min(1),
  harvested: z.boolean().optional(),
  respawnAt: finite.optional(),
  hp: finite.optional(),
  open: z.boolean().optional(),
  /** 任務 3D 加入（選填，v4 舊存檔沒有這個欄位仍然有效） */
  repaired: z.boolean().optional(),
});

export const saveDataSchema = z.object({
  version: z.literal(SAVE_VERSION),
  /** 存檔時間（ISO 8601） */
  savedAt: z.string().min(1),
  player: z.object({
    position: z.object({ x: finite, y: finite, z: finite }),
    facingYaw: finite,
  }),
  world: z.object({
    /** 遊戲時間（秒），亦即遊玩時間 */
    time: finite.nonnegative(),
    objects: z.array(saveObjectDeltaSchema),
  }),
  inventory: z.object({
    slots: z.array(z.object({ itemId: z.string().min(1), count: z.number().int().positive() }).nullable()),
  }),
  tutorial: z.enum(tutorialSteps),
  mist: mistStagesSchema,
  quests: z.record(z.string(), z.object({ status: z.enum(['active', 'completed']), progress: z.array(z.number().int().nonnegative()).optional() })),
  combat: z.object({
    hp: finite.nonnegative(),
    /** 星光值（v9，GAME_DESIGN 5.4） */
    mp: finite.nonnegative(),
    enemies: z.array(z.object({ id: z.string().min(1), kind: z.string().min(1), spawner: z.string().min(1), hp: finite.positive() })),
    spawners: z.record(z.string(), z.object({ nextSpawnAt: finite, counter: z.number().int().nonnegative() })),
  }),
  companion: z.object({ unlocked: z.boolean() }),
  build: z.object({
    buildings: z.array(z.object({ id: z.string().min(1), buildable: z.string().min(1), x: finite, z: finite, yaw: finite })),
    nextBuildingId: z.number().int().positive(),
  }),
  /** 裝備（v8，GAME_DESIGN 5.3）：目前的近戰武器 */
  loadout: z.object({ weapon: z.enum(weaponIds) }),
  /** 世界地圖（v11，Bible §31.3）：探索紀錄（每 8 m 一格的位元組，base64） */
  map: z.object({ explored: z.string() }),
});
export type SaveData = z.infer<typeof saveDataSchema>;

/** 存檔列表顯示用的摘要 */
export type SaveMeta = { slot: string; savedAt: string; playTime: number };

/** 存檔欄位名稱：只允許小寫英數、底線與連字號（主程序以此組檔名，避免路徑穿越） */
export const SLOT_PATTERN = /^[a-z0-9_-]{1,32}$/;
export const MAIN_SLOT = 'slot1';
export const SETTINGS_SLOT = 'settings';
