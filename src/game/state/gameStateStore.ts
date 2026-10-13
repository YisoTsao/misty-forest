import { create } from 'zustand';
import type { GameState } from '@/game-core/authority/rules';
import { authority } from '../authority';

// 權威狀態的唯讀鏡像（規格 3-3：UI 與 3D 只透過 selector 讀取）。
// 只由 Authority 的事件通知更新，任何元件都不直接寫入。
export const useGameStateStore = create<{ state: GameState }>(() => ({ state: authority.getState() }));

authority.subscribe((_, state) => useGameStateStore.setState({ state }));
