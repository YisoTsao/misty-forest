import type { SaveStorage, StoredFile } from './storage';

/**
 * 記憶體實作：測試用，行為與檔案版一致（寫入時上一版移到備份）。
 * raw 讓測試能直接放入損壞的內容。
 */
export class MemoryStorage implements SaveStorage {
  readonly primary = new Map<string, string>();
  readonly backup = new Map<string, string>();

  async list(): Promise<StoredFile[]> {
    return [...this.primary.keys()].map((slot) => ({ slot, savedAt: null }));
  }

  async read(slot: string, source: 'primary' | 'backup' = 'primary'): Promise<unknown> {
    const text = (source === 'primary' ? this.primary : this.backup).get(slot);
    return text === undefined ? null : (JSON.parse(text) as unknown);
  }

  async write(slot: string, data: unknown): Promise<void> {
    const previous = this.primary.get(slot);
    if (previous !== undefined) this.backup.set(slot, previous);
    this.primary.set(slot, JSON.stringify(data));
  }

  async export(slot: string): Promise<Blob> {
    const text = this.primary.get(slot);
    if (text === undefined) throw new Error(`沒有存檔：${slot}`);
    return new Blob([text], { type: 'application/json' });
  }
}
