// 水鏡光路的表現狀態（任務 9D）：MirrorPuzzle 寫入、除錯 API 讀取（端對端測試確認光束有畫出來）。
// 依光路 id 分開記錄（第二章 Phase 4 起有多條光路）。
export const lightPathRuntime: Record<string, number> = {};
