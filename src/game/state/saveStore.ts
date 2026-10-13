import { create } from 'zustand';

/** 主存檔目前的狀態（主選單顯示「繼續遊戲」與損壞提示用） */
export type MainSaveInfo =
  | { status: 'checking' }
  | { status: 'missing' }
  | { status: 'ok' | 'restored-from-backup'; savedAt: string; playTime: number }
  | { status: 'corrupt'; error: string };

type SaveState = {
  mainSave: MainSaveInfo;
  saving: boolean;
  /** 本次執行最後一次成功存檔的時間（ISO） */
  lastSavedAt: string | null;
  /** 最後一次存檔失敗的原因；成功後清除 */
  saveError: string | null;
};

// 存檔系統的 UI 狀態（不是存檔內容本身）。只由 saveService 寫入。
export const useSaveStore = create<SaveState>(() => ({
  mainSave: { status: 'checking' },
  saving: false,
  lastSavedAt: null,
  saveError: null,
}));
