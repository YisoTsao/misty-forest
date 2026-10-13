import { create } from 'zustand';
import { DEFAULT_REGION } from '@/game-core/world/regions';
import type { InteractionKind, RegionId } from '@/game-core/world/types';

export type InteractTarget = { id: string; kind: InteractionKind; nameKey: string };
export type UiMessage = { titleKey: string; bodyKey: string };
/** 畫面角落的短暫通知：取得物品（itemId + count）或一般訊息（textKey） */
export type Toast = { id: number; itemId?: string; count?: number; textKey?: string; vars?: Record<string, string | number> };

/** 同時顯示的通知上限；超過時最舊的先移除 */
const MAX_TOASTS = 5;
let nextToastId = 1;

// 本機 UI 狀態：互動提示目標、訊息視窗與通知。只在內容改變時寫入，不每幀 set。
type UiState = {
  interactTarget: InteractTarget | null;
  message: UiMessage | null;
  toasts: readonly Toast[];
  /** 背包視窗（規格 6.3） */
  inventoryOpen: boolean;
  /** 設定畫面（從主選單或暫停選單開啟） */
  settingsOpen: boolean;
  /** 進行中的 NPC 對話（dialogueController 寫入） */
  dialogue: { npcId: string; dialogueId: string; nodeId: string } | null;
  /** 玩家目前所在區域（RegionTracker 在改變時寫入） */
  currentRegion: RegionId;
  setInteractTarget: (target: InteractTarget | null) => void;
  showMessage: (message: UiMessage) => void;
  closeMessage: () => void;
  pushToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
  setInventoryOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setCurrentRegion: (region: RegionId) => void;
  setDialogue: (dialogue: UiState['dialogue']) => void;
};

export const useUiStore = create<UiState>((set, get) => ({
  interactTarget: null,
  message: null,
  toasts: [],
  inventoryOpen: false,
  settingsOpen: false,
  currentRegion: DEFAULT_REGION,
  dialogue: null,
  setInteractTarget: (target) => {
    if (get().interactTarget?.id === target?.id) return;
    set({ interactTarget: target });
  },
  showMessage: (message) => set({ message }),
  closeMessage: () => set({ message: null }),
  pushToast: (toast) => set({ toasts: [...get().toasts, { ...toast, id: nextToastId++ }].slice(-MAX_TOASTS) }),
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  setInventoryOpen: (inventoryOpen) => set({ inventoryOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setDialogue: (dialogue) => set({ dialogue }),
  setCurrentRegion: (currentRegion) => {
    if (get().currentRegion !== currentRegion) set({ currentRegion });
  },
}));

/** 有任何會擋住遊玩的視窗開啟中（角色停止接受移動輸入、釋放滑鼠） */
export function isModalOpen(): boolean {
  const { message, inventoryOpen, settingsOpen, dialogue } = useUiStore.getState();
  return message !== null || inventoryOpen || settingsOpen || dialogue !== null;
}
