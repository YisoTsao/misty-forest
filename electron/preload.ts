import { contextBridge, ipcRenderer } from 'electron';

// 最小暴露面：Renderer 只能看到這裡列出的 API（規格 2.2）。
// 存檔只能經由主程序讀寫 userData 下的固定資料夾，欄位名稱在主程序再驗證一次。
const api = {
  platform: process.platform,
  isElectron: true,
  saves: {
    list: (): Promise<{ slot: string; savedAt: string | null }[]> => ipcRenderer.invoke('save:list'),
    read: (slot: string, source: 'primary' | 'backup'): Promise<unknown> => ipcRenderer.invoke('save:read', slot, source),
    write: (slot: string, data: unknown): Promise<void> => ipcRenderer.invoke('save:write', slot, data),
    readText: (slot: string): Promise<string | null> => ipcRenderer.invoke('save:readText', slot),
  },
  // OAuth 登入（T-184）：系統瀏覽器登入後導回本機，回傳 code（或錯誤）
  auth: {
    redirect: (): Promise<string> => ipcRenderer.invoke('auth:redirect'),
    start: (url: string): Promise<{ code?: string; error?: string }> => ipcRenderer.invoke('auth:start', url),
    cancel: (): Promise<void> => ipcRenderer.invoke('auth:cancel'),
  },
} as const;

contextBridge.exposeInMainWorld('mistwood', api);

export type MistwoodBridge = typeof api;
