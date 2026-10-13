import { create } from 'zustand';
import { nextScreen, type FlowAction, type GameScreen } from '@/game-core/flow/gameFlow';
import { cameraRuntime, playerRuntime } from '../player/localRuntime';
import { useUiStore } from './uiStore';
import { useWorldStore } from './worldStore';

// 遊戲流程狀態（本機）：主選單 / 遊玩 / 暫停。只在切換時寫入。
type GameState = {
  screen: GameScreen;
  /** 每開始一次新遊戲遞增（Phase 2 讀取存檔後也會遞增） */
  session: number;
  send: (action: FlowAction) => void;
};

/** ?play=1 略過主選單直接開始（端對端測試與截圖用） */
function initialScreen(): GameScreen {
  return new URLSearchParams(window.location.search).has('play') ? 'playing' : 'title';
}

export const useGameStore = create<GameState>((set, get) => ({
  screen: initialScreen(),
  session: 0,
  send: (action) => {
    const { screen, session } = get();
    const next = nextScreen(screen, action);
    if (next === screen) return;
    if (action === 'startGame') {
      // 新遊戲：世界物件與角色回到初始狀態（Phase 2 改為「新遊戲 / 讀取存檔」）
      useWorldStore.getState().reset();
      useUiStore.getState().closeMessage();
      playerRuntime.newGameRequest = true;
      Object.assign(cameraRuntime, { yaw: 0, pitch: 0.35, distance: 6 });
      set({ screen: next, session: session + 1 });
      return;
    }
    set({ screen: next });
  },
}));

export function currentScreen(): GameScreen {
  return useGameStore.getState().screen;
}
