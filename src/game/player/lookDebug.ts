import type { LookPart } from '@/game-core/equipment/equipment';

/** 驗證用：本機角色手上武器與各身體部位實際套用的發光顏色（裝備外觀，第三章規格 §7.4） */
export type LookInfo = { weapon: string | null; weaponEmissive: number[] | null; parts: Partial<Record<LookPart, number[]>> };

/** 本機玩家角色模型掛載時設定，除錯 API 讀取 */
export const localLook: { inspect: (() => LookInfo) | null } = { inspect: null };
