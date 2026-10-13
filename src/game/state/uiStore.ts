import { create } from 'zustand';
import type { InteractionKind } from '@/game-core/world/types';

export type InteractTarget = { id: string; kind: InteractionKind; nameKey: string };
export type UiMessage = { titleKey: string; bodyKey: string };

// 本機 UI 狀態：互動提示目標與訊息視窗。只在內容改變時寫入，不每幀 set。
type UiState = {
  interactTarget: InteractTarget | null;
  message: UiMessage | null;
  setInteractTarget: (target: InteractTarget | null) => void;
  showMessage: (message: UiMessage) => void;
  closeMessage: () => void;
};

export const useUiStore = create<UiState>((set, get) => ({
  interactTarget: null,
  message: null,
  setInteractTarget: (target) => {
    if (get().interactTarget?.id === target?.id) return;
    set({ interactTarget: target });
  },
  showMessage: (message) => set({ message }),
  closeMessage: () => set({ message: null }),
}));

/** 有任何會擋住遊玩的視窗開啟中（角色停止接受移動輸入、釋放滑鼠） */
export function isModalOpen(): boolean {
  return useUiStore.getState().message !== null;
}
