// 讀檔流程（規格 6.8）：主檔 → 失敗時試備份 → 仍失敗則回報損壞，讓玩家開始新遊戲（不得白畫面）。
import type { SaveStorage } from './storage';

export type LoadOutcome<T> =
  | { status: 'ok'; value: T }
  | { status: 'restored-from-backup'; value: T; primaryError: string }
  | { status: 'missing' }
  | { status: 'corrupt'; primaryError: string; backupError: string };

/** parse 負責遷移與驗證，失敗時拋錯；讀取本身的錯誤（JSON 損壞）也視為該檔損壞。 */
export async function loadWithFallback<T>(storage: SaveStorage, slot: string, parse: (raw: unknown) => T): Promise<LoadOutcome<T>> {
  const attempt = async (source: 'primary' | 'backup'): Promise<{ value: T } | { missing: true } | { error: string }> => {
    try {
      const raw = await storage.read(slot, source);
      if (raw === null || raw === undefined) return { missing: true };
      return { value: parse(raw) };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  };

  const primary = await attempt('primary');
  if ('value' in primary) return { status: 'ok', value: primary.value };
  const backup = await attempt('backup');
  if ('value' in backup) {
    return { status: 'restored-from-backup', value: backup.value, primaryError: 'error' in primary ? primary.error : '主檔不存在' };
  }
  if ('missing' in primary && 'missing' in backup) return { status: 'missing' };
  return {
    status: 'corrupt',
    primaryError: 'error' in primary ? primary.error : '主檔不存在',
    backupError: 'error' in backup ? backup.error : '備份不存在',
  };
}
