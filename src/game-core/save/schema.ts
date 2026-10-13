// 存檔格式（規格 6.8）。只存權威狀態與必要的本機狀態（玩家位置），世界物件只存與預設不同的差異（第 4 層）。
// 每次格式變更：版本號 +1、在 migrate.ts 加入遷移函式與測試。
import { z } from 'zod';
import { tutorialSteps } from '../tutorial/tutorial';
import { mistStagesSchema } from '../world/regions';

/** v1：Phase 2 第一版。v2：加入教學進度 tutorial。v3：加入各區域迷霧 mist。v4：加入任務 quests */
export const SAVE_VERSION = 4;

const finite = z.number().refine(Number.isFinite, '必須是有限數值');

export const saveObjectDeltaSchema = z.object({
  placementId: z.string().min(1),
  harvested: z.boolean().optional(),
  respawnAt: finite.optional(),
  hp: finite.optional(),
  open: z.boolean().optional(),
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
  quests: z.record(z.string(), z.object({ status: z.enum(['active', 'completed']) })),
});
export type SaveData = z.infer<typeof saveDataSchema>;

/** 存檔列表顯示用的摘要 */
export type SaveMeta = { slot: string; savedAt: string; playTime: number };

/** 存檔欄位名稱：只允許小寫英數、底線與連字號（主程序以此組檔名，避免路徑穿越） */
export const SLOT_PATTERN = /^[a-z0-9_-]{1,32}$/;
export const MAIN_SLOT = 'slot1';
export const SETTINGS_SLOT = 'settings';
