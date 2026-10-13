// 存檔儲存介面（規格 6.8）：Electron 主程序（JSON 檔，原子寫入 + 備份）與網頁開發模式（IndexedDB）實作同一介面。
// 介面只搬運資料；格式驗證、遷移與備份還原的決策在 load.ts，兩種實作共用。

export type StoredFile = { slot: string; savedAt: string | null };

export interface SaveStorage {
  /** 已存在的欄位（不含備份） */
  list(): Promise<StoredFile[]>;
  /** 讀取主檔或備份；不存在時回傳 null。內容無法解析（例如 JSON 損壞）時拋錯。 */
  read(slot: string, source?: 'primary' | 'backup'): Promise<unknown>;
  /** 寫入：先保留上一版為備份，再以原子方式取代主檔 */
  write(slot: string, data: unknown): Promise<void>;
  /** 匯出主檔內容（JSON） */
  export(slot: string): Promise<Blob>;
}
