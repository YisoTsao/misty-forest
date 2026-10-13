// 存檔版本遷移：每個舊版本一個函式，把資料升一版，依序套用到最新版。
import { SAVE_VERSION } from './schema';

export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

export class SaveFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveFormatError';
  }
}

/**
 * key = 來源版本，函式把 v 版資料轉成 v + 1 版。
 * 目前只有第 1 版；第一次變更格式時在這裡加入 1: (v1) => v2，並補測試。
 */
export const saveMigrations: Readonly<Record<number, Migration>> = {};

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
