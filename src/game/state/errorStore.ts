import { create } from 'zustand';

// 執行期錯誤（資產載入失敗等）集中於此，由 UI 顯示，不默默吞掉。
type ErrorState = {
  errors: string[];
  reportError: (message: string) => void;
};

export const useErrorStore = create<ErrorState>((set) => ({
  errors: [],
  reportError: (message) => set((s) => (s.errors.includes(message) ? s : { errors: [...s.errors, message] })),
}));
