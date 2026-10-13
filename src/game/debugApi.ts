import { requiredClipKeys, type ClipKey } from '@/game-core/character/characterDef';
import type { FlowAction, GameScreen } from '@/game-core/flow/gameFlow';
import { parseMistLevel } from '@/game-core/world/mist';
import { initialGameState, type GameCommand } from '@/game-core/authority/rules';
import { countItem, type InventorySlot } from '@/game-core/inventory/inventory';
import type { ObjectRuntime } from '@/game-core/world/types';
import { MAIN_SLOT } from '@/game-core/save/schema';
import { authority } from './authority';
import { getCharacterDef, PLAYER_CHARACTER_ID } from './character/characters';
import { perfStats } from './perfStats';
import { cameraRuntime, playerRuntime } from './player/localRuntime';
import { useDebugStore, type CameraMode } from './state/debugStore';
import { saveGame } from './save/saveService';
import { saveStorage } from './save/storages';
import { useGameStore } from './state/gameStore';
import { useSettingsStore } from './state/settingsStore';
import { useUiStore } from './state/uiStore';
import { mistRuntime } from './world/mistRuntime';
import { cameraBookmarks } from './worldData';

export type MistwoodDebugApi = {
  isReady: () => boolean;
  bookmarks: () => string[];
  setBookmark: (id: string) => void;
  setCameraMode: (mode: CameraMode) => void;
  /** 規格 4.6 要求的動畫鍵 */
  animKeys: () => readonly string[];
  /** 讓玩家角色停在指定動畫的某個時間比例（0–1）；傳 null 恢復正常。 */
  previewAnimation: (key: string | null, fraction?: number) => void;
  /** 唯讀快照：端對端測試用 */
  playerState: () => {
    x: number;
    y: number;
    z: number;
    anim: string;
    grounded: boolean;
    speed: number;
    facingYaw: number;
    action: string | null;
    respawnCount: number;
  };
  teleport: (x: number, z: number) => void;
  /** 跟隨相機目前的角度與距離 */
  cameraAngles: () => { yaw: number; pitch: number; distance: number };
  /** 設定跟隨相機的角度與距離（省略的欄位不變），回傳目前相機位置 */
  camera: (set?: { yaw?: number; pitch?: number; distance?: number }) => { x: number; y: number; z: number };
  /** 設定迷霧目標（0–1）；instant 預設 true（截圖用，不漸變） */
  setMist: (value: number, instant?: boolean) => void;
  /** 目前畫面上的迷霧值與目標值 */
  mist: () => { current: number; target: number };
  /** 目前顯示互動提示的物件 id */
  interactTarget: () => string | null;
  objectState: (placementId: string) => ObjectRuntime | null;
  /** 權威狀態回到新遊戲（端對端測試用） */
  resetWorld: () => void;
  /** 背包格子快照 */
  inventory: () => InventorySlot[];
  itemCount: (itemId: string) => number;
  /** 遊戲時間（秒） */
  gameTime: () => number;
  /** 直接送出指令給權威層（測試用，例如快轉時間驗證重生） */
  send: (command: GameCommand) => void;
  /** 立即存檔（等同暫停選單的「儲存遊戲」），回傳是否成功 */
  saveNow: () => Promise<boolean>;
  /** 匯出主存檔的內容（JSON 字串） */
  exportSave: () => Promise<string>;
  /** 目前的設定值 */
  settings: () => { quality: string };
  /** 目前畫面上的通知 */
  toasts: () => { itemId?: string; count?: number; textKey?: string }[];
  activeColliders: () => number;
  /** 效能量測數據快照（scripts/perf.mjs 使用） */
  perf: () => typeof perfStats & { jsHeapMB: number | null };
  /** 送出遊戲流程動作（主選單 / 暫停），回傳切換後的畫面 */
  flow: (action: FlowAction) => GameScreen;
};

declare global {
  interface Window {
    __mistwoodDebug?: MistwoodDebugApi;
  }
}

export const debugEnabled = import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');

function isClipKey(key: string): key is ClipKey {
  return (requiredClipKeys as readonly string[]).includes(key);
}

/** 截圖腳本與除錯使用。僅在開發模式或帶 ?debug 時暴露。 */
export function installDebugApi(): void {
  if (!debugEnabled) return;
  window.__mistwoodDebug = {
    isReady: () => useDebugStore.getState().sceneReady,
    bookmarks: () => cameraBookmarks.map((b) => b.id),
    setBookmark: (id) => {
      if (!cameraBookmarks.some((b) => b.id === id)) throw new Error(`未知的攝影機書籤：${id}`);
      useDebugStore.getState().requestBookmark(id);
    },
    setCameraMode: (mode) => useDebugStore.getState().setCameraMode(mode),
    animKeys: () => requiredClipKeys,
    previewAnimation: (key, fraction = 0.4) => {
      if (key === null) {
        playerRuntime.animPreview = null;
        return;
      }
      if (!isClipKey(key)) throw new Error(`未知的動畫鍵：${key}`);
      playerRuntime.animPreview = { clip: getCharacterDef(PLAYER_CHARACTER_ID).clips[key], fraction };
    },
    playerState: () => {
      const { position, locomotion: l } = playerRuntime;
      return {
        ...position,
        anim: l.anim,
        grounded: l.grounded,
        speed: Math.hypot(l.vx, l.vz),
        facingYaw: l.facingYaw,
        action: playerRuntime.action?.clip ?? null,
        respawnCount: playerRuntime.respawnCount,
      };
    },
    teleport: (x, z) => {
      playerRuntime.teleportRequest = { x, z };
    },
    cameraAngles: () => ({ yaw: cameraRuntime.yaw, pitch: cameraRuntime.pitch, distance: cameraRuntime.distance }),
    camera: (set) => {
      Object.assign(cameraRuntime, set ?? {});
      return { ...cameraRuntime.position };
    },
    setMist: (value, instant = true) => {
      const level = parseMistLevel(value);
      if (level === null) throw new Error(`迷霧值必須是數字：${value}`);
      useDebugStore.getState().setMistTarget(level, instant);
    },
    mist: () => ({ current: mistRuntime.value, target: useDebugStore.getState().mistTarget }),
    interactTarget: () => useUiStore.getState().interactTarget?.id ?? null,
    objectState: (id) => authority.getState().objects.get(id) ?? null,
    resetWorld: () => {
      authority.replaceState(initialGameState());
      useUiStore.getState().closeMessage();
    },
    inventory: () => [...authority.getState().inventory.slots],
    itemCount: (itemId) => countItem(authority.getState().inventory, itemId),
    gameTime: () => authority.getState().time,
    send: (command) => authority.send(command),
    saveNow: () => saveGame(),
    exportSave: async () => (await saveStorage.export(MAIN_SLOT)).text(),
    settings: () => ({ quality: useSettingsStore.getState().quality }),
    toasts: () => useUiStore.getState().toasts.map(({ itemId, count, textKey }) => ({ itemId, count, textKey })),
    activeColliders: () => perfStats.activeColliders,
    perf: () => {
      // performance.memory 為 Chromium 專有 API
      const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
      return { ...perfStats, jsHeapMB: memory ? memory.usedJSHeapSize / 1048576 : null };
    },
    flow: (action) => {
      useGameStore.getState().send(action);
      return useGameStore.getState().screen;
    },
  };
}

/** 讀取初始 ?mist= 參數（0–1）；不合法時回傳 null。 */
export function initialMistFromUrl(): number | null {
  return parseMistLevel(new URLSearchParams(window.location.search).get('mist'));
}

/** 讀取初始 ?cam= 參數。 */
export function initialBookmarkFromUrl(): string | null {
  const cam = new URLSearchParams(window.location.search).get('cam');
  return cam && cameraBookmarks.some((b) => b.id === cam) ? cam : null;
}
