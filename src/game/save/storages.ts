import type { SaveStorage, StoredFile } from '@/game-core/save/storage';

type ElectronSaves = {
  list: () => Promise<StoredFile[]>;
  read: (slot: string, source: 'primary' | 'backup') => Promise<unknown>;
  write: (slot: string, data: unknown) => Promise<void>;
  readText: (slot: string) => Promise<string | null>;
};

/** 桌面版的 OAuth 登入（electron/oauthLoopback.ts，T-184） */
type ElectronAuth = {
  redirect: () => Promise<string>;
  start: (url: string) => Promise<{ code?: string; error?: string }>;
  cancel: () => Promise<void>;
};

declare global {
  interface Window {
    /** electron/preload.ts 暴露的最小 API；純網頁開發模式下不存在 */
    mistwood?: { platform: string; isElectron: true; saves: ElectronSaves; auth?: ElectronAuth };
  }
}

/** 正式版：經由 IPC 交給主程序讀寫 userData/saves 下的 JSON（原子寫入與備份在主程序）。 */
class ElectronStorage implements SaveStorage {
  constructor(private readonly saves: ElectronSaves) {}
  list() {
    return this.saves.list();
  }
  read(slot: string, source: 'primary' | 'backup' = 'primary') {
    return this.saves.read(slot, source);
  }
  write(slot: string, data: unknown) {
    return this.saves.write(slot, data);
  }
  async export(slot: string): Promise<Blob> {
    const text = await this.saves.readText(slot);
    if (text === null) throw new Error(`沒有存檔：${slot}`);
    return new Blob([text], { type: 'application/json' });
  }
}

const DB_NAME = 'mistwood';
const STORE = 'saves';

/**
 * 純網頁開發模式（`pnpm dev` 用瀏覽器開啟）：IndexedDB，介面與檔案版相同。
 * 主檔與備份在同一個 transaction 內更新，同樣不會出現只寫一半的狀態。內容存 JSON 字串，與檔案版一樣可能損壞。
 */
class IndexedDbStorage implements SaveStorage {
  private db: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('無法開啟 IndexedDB'));
    });
    return this.db;
  }

  private async run<T>(mode: IDBTransactionMode, body: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = body(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 交易失敗'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB 交易中止'));
    });
  }

  async list(): Promise<StoredFile[]> {
    const keys = (await this.run('readonly', (s) => s.getAllKeys())) ?? [];
    return keys.map(String).filter((k) => !k.endsWith('.bak')).map((slot) => ({ slot, savedAt: null }));
  }

  async read(slot: string, source: 'primary' | 'backup' = 'primary'): Promise<unknown> {
    const text = await this.run<string | undefined>('readonly', (s) => s.get(source === 'primary' ? slot : `${slot}.bak`));
    return text === undefined ? null : (JSON.parse(text) as unknown);
  }

  async write(slot: string, data: unknown): Promise<void> {
    const text = JSON.stringify(data);
    await this.run('readwrite', (s) => {
      const previous = s.get(slot);
      previous.onsuccess = () => {
        if (previous.result !== undefined) s.put(previous.result, `${slot}.bak`);
        s.put(text, slot);
      };
    });
  }

  async export(slot: string): Promise<Blob> {
    const text = await this.run<string | undefined>('readonly', (s) => s.get(slot));
    if (text === undefined) throw new Error(`沒有存檔：${slot}`);
    return new Blob([text], { type: 'application/json' });
  }
}

/** Electron 中使用檔案存檔；純網頁或帶 ?storage=indexeddb（測試用）時使用 IndexedDB。 */
function createStorage(): SaveStorage {
  const forceIdb = new URLSearchParams(window.location.search).get('storage') === 'indexeddb';
  if (window.mistwood?.saves && !forceIdb) return new ElectronStorage(window.mistwood.saves);
  return new IndexedDbStorage();
}

export const saveStorage: SaveStorage = createStorage();
