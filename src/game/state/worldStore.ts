import { create } from 'zustand';
import { applyWorldEvents, handleInteract, type InteractCommand, type WorldEvent, type WorldLookup } from '@/game-core/world/objects';
import type { ObjectRuntime } from '@/game-core/world/types';

// 權威狀態（規格 3-7）：世界物件的執行期狀態。只由 game-core 產生的事件改變。
// Phase 2 存檔時以這裡的內容產生 SaveObjectDelta。
type WorldState = {
  objects: ReadonlyMap<string, ObjectRuntime>;
  /** 送出指令並套用結果事件，回傳事件供呼叫端做表現（動畫、訊息） */
  dispatch: (world: WorldLookup, cmd: InteractCommand) => WorldEvent[];
  /** 測試與除錯：回到初始狀態 */
  reset: () => void;
};

export const useWorldStore = create<WorldState>((set, get) => ({
  objects: new Map(),
  dispatch: (world, cmd) => {
    const events = handleInteract(get().objects, world, cmd);
    if (events.some((e) => e.type !== 'CommandRejected')) set({ objects: applyWorldEvents(get().objects, events) });
    return events;
  },
  reset: () => set({ objects: new Map() }),
}));
