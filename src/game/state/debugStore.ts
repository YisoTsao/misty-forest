import { create } from 'zustand';

export type CameraMode = 'follow' | 'free';

// 本機暫態（規格 3-7）：攝影機模式、除錯書籤與場景就緒旗標，不進存檔。
type DebugState = {
  cameraMode: CameraMode;
  /** 目前套用的書籤；每次 requestBookmark 都會遞增 nonce 以便重複套用同一書籤。 */
  bookmark: { id: string; nonce: number } | null;
  sceneReady: boolean;
  /** 除錯滑桿的迷霧目標值（0 晴朗 – 1 迷霧）。Phase 3 改由各區域的 mistStage 決定 */
  mistTarget: number;
  /** 每次要求「立即套用、不漸變」時遞增（截圖用） */
  mistSnap: number;
  /** 切到自由視角並套用書籤 */
  requestBookmark: (id: string) => void;
  setCameraMode: (mode: CameraMode) => void;
  setSceneReady: (ready: boolean) => void;
  setMistTarget: (value: number, instant?: boolean) => void;
};

export const useDebugStore = create<DebugState>((set) => ({
  cameraMode: 'follow',
  bookmark: null,
  sceneReady: false,
  mistTarget: 0,
  mistSnap: 0,
  requestBookmark: (id) => set((s) => ({ cameraMode: 'free', bookmark: { id, nonce: (s.bookmark?.nonce ?? 0) + 1 } })),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  setSceneReady: (sceneReady) => set({ sceneReady }),
  setMistTarget: (value, instant = false) =>
    set((s) => ({ mistTarget: Math.min(1, Math.max(0, value)), mistSnap: instant ? s.mistSnap + 1 : s.mistSnap })),
}));
