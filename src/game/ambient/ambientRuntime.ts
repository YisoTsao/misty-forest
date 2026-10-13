// 環境動畫的本機狀態（羊群）：除錯 API 與端對端讀取用，不存檔。
import type { Sheep } from '@/game-core/ambient/sheep';

export const ambientRuntime = {
  flocks: new Map<string, Sheep[]>(),
  flockPaused: new Map<string, boolean>(),
};
