import { contextBridge } from 'electron';

// 最小暴露面：Renderer 只能看到這裡列出的 API。
// 存檔 IPC 於 Phase 2 加入（規格 6.8）。
const api = {
  platform: process.platform,
  isElectron: true,
} as const;

contextBridge.exposeInMainWorld('mistwood', api);

export type MistwoodBridge = typeof api;
