// 設定值的存檔格式（規格 6.8：設定值與存檔同一套儲存機制，獨立欄位 settings）。
import { z } from 'zod';
import { bindingsSchema } from '../input/actions';
import { qualityLevels } from './quality';

export const SETTINGS_VERSION = 1;

export const settingsDataSchema = z.object({
  version: z.literal(SETTINGS_VERSION),
  quality: z.enum(qualityLevels),
  /** 按鍵設定；省略表示使用預設（data/keybindings.json） */
  bindings: bindingsSchema.optional(),
});
export type SettingsData = z.infer<typeof settingsDataSchema>;

/** 解析設定；格式不符時回傳 null（呼叫端改用預設值，不阻擋啟動） */
export function parseSettings(raw: unknown): SettingsData | null {
  const parsed = settingsDataSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
