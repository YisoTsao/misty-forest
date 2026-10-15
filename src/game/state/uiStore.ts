import { create } from 'zustand';
import { DEFAULT_REGION } from '@/game-core/world/regions';
import type { InteractionKind, RegionId } from '@/game-core/world/types';

export type InteractTarget = { id: string; kind: InteractionKind; nameKey: string; verbKey?: string };
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
  /** 世界地圖（任務 7B） */
  mapOpen: boolean;
  /** 任務日誌（任務 7F） */
  journalOpen: boolean;
  /** 開著的商店（任務 7H），null 表示沒有 */
  shop: string | null;
  /** 開著的工作台（任務 7J），null 表示沒有 */
  craft: string | null;
  /** 設定畫面（從主選單或暫停選單開啟） */
  settingsOpen: boolean;
  /** 多人連線面板（任務 11A，從暫停選單開啟） */
  multiplayerOpen: boolean;
  /** 建造模式（規格 6.7）：null 表示不在建造模式；menu 為建造選單是否開啟 */
  build: { menu: boolean; selected: string | null } | null;
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
  setMapOpen: (open: boolean) => void;
  setJournalOpen: (open: boolean) => void;
  setShop: (shop: string | null) => void;
  setCraft: (craft: string | null) => void;
  setSettingsOpen: (open: boolean) => void;
  setMultiplayerOpen: (open: boolean) => void;
  setCurrentRegion: (region: RegionId) => void;
  setDialogue: (dialogue: UiState['dialogue']) => void;
  setBuild: (build: UiState['build']) => void;
};

export const useUiStore = create<UiState>((set, get) => ({
  interactTarget: null,
  message: null,
  toasts: [],
  inventoryOpen: false,
  mapOpen: false,
  journalOpen: false,
  shop: null,
  craft: null,
  settingsOpen: false,
  multiplayerOpen: false,
  currentRegion: DEFAULT_REGION,
  dialogue: null,
  build: null,
  setInteractTarget: (target) => {
    if (get().interactTarget?.id === target?.id) return;
    set({ interactTarget: target });
  },
  showMessage: (message) => set({ message }),
  closeMessage: () => set({ message: null }),
  pushToast: (toast) => set({ toasts: [...get().toasts, { ...toast, id: nextToastId++ }].slice(-MAX_TOASTS) }),
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  setInventoryOpen: (inventoryOpen) => set({ inventoryOpen }),
  setMapOpen: (mapOpen) => set({ mapOpen }),
  setJournalOpen: (journalOpen) => set({ journalOpen }),
  setShop: (shop) => set({ shop }),
  setCraft: (craft) => set({ craft }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setMultiplayerOpen: (multiplayerOpen) => set({ multiplayerOpen }),
  setDialogue: (dialogue) => set({ dialogue }),
  setBuild: (build) => set({ build }),
  setCurrentRegion: (currentRegion) => {
    if (get().currentRegion !== currentRegion) set({ currentRegion });
  },
}));

/** 有任何會擋住遊玩的視窗開啟中（角色停止接受移動輸入、釋放滑鼠） */
export function isModalOpen(): boolean {
  const { message, inventoryOpen, mapOpen, journalOpen, shop, craft, settingsOpen, multiplayerOpen, dialogue, build } = useUiStore.getState();
  return (
    message !== null || inventoryOpen || mapOpen || journalOpen || shop !== null || craft !== null || settingsOpen || multiplayerOpen || dialogue !== null || build?.menu === true
  );
}
