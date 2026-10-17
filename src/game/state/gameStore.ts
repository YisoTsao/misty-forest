import { create } from 'zustand';
import { initialGameState } from '@/game-core/authority/rules';
import { isHeroClassId } from '@/game-core/character/heroClass';
import { nextScreen, type FlowAction, type GameScreen } from '@/game-core/flow/gameFlow';
import type { LoadedSave } from '@/game-core/save/convert';
import { authority } from '../authority';
import { endTalk } from '../dialogueController';
import { resetLocation } from '../location';
import { cameraRuntime, playerRuntime } from '../player/localRuntime';
import { useUiStore } from './uiStore';

// 遊戲流程狀態（本機）：主選單 / 遊玩 / 暫停。只在切換時寫入。
type GameState = {
  screen: GameScreen;
  /** 每開始一次遊戲（新遊戲或讀檔）遞增 */
  session: number;
  send: (action: FlowAction) => void;
  /** 從主選單開始一局：loaded 為 null 時是新遊戲，否則還原存檔 */
  beginSession: (loaded: LoadedSave | null) => void;
};

/** ?play=1 略過主選單直接開始新遊戲（端對端測試與截圖用） */
function initialScreen(): GameScreen {
  return new URLSearchParams(window.location.search).has('play') ? 'playing' : 'title';
}

export const useGameStore = create<GameState>((set, get) => ({
  screen: initialScreen(),
  session: 0,
  send: (action) => {
    if (action === 'startGame') {
      get().beginSession(null);
      return;
    }
    const next = nextScreen(get().screen, action);
    if (next !== get().screen) set({ screen: next });
  },
  beginSession: (loaded) => {
    const { screen, session } = get();
    const next = nextScreen(screen, 'startGame');
    if (next === screen) return;
    authority.replaceState(loaded?.state ?? initialGameState());
    const ui = useUiStore.getState();
    ui.closeMessage();
    ui.setInventoryOpen(false);
    endTalk();
    resetLocation();
    if (loaded) {
      // 讀檔：回到存檔位置，攝影機在角色背後
      playerRuntime.restoreRequest = loaded.player;
      Object.assign(cameraRuntime, { yaw: loaded.player.facingYaw - Math.PI, pitch: 0.35, distance: 6 });
    } else {
      playerRuntime.newGameRequest = true;
      Object.assign(cameraRuntime, { yaw: 0, pitch: 0.35, distance: 6 });
    }
    set({ screen: next, session: session + 1 });
  },
}));

// ?play=1&class=mage：直接以指定職業開始（端對端測試與截圖用）
{
  const autoClass = new URLSearchParams(window.location.search).get('class');
  if (initialScreen() === 'playing' && isHeroClassId(autoClass)) authority.send({ type: 'ChooseClass', heroClass: autoClass });
}

export function currentScreen(): GameScreen {
  return useGameStore.getState().screen;
}
