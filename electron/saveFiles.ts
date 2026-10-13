// 存檔檔案操作（主程序，規格 6.8）：原子寫入 + 滾動備份。
// <dir>/<slot>.json 為主檔、<slot>.bak.json 為上一版、<slot>.tmp 為寫入中的暫存檔。
import { copyFile, mkdir, open, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

/** 與 game-core/save/schema.ts 的 SLOT_PATTERN 相同（主程序不 import renderer 程式碼） */
const SLOT_PATTERN = /^[a-z0-9_-]{1,32}$/;
/** 單一存檔大小上限，避免異常資料寫爆磁碟 */
const MAX_BYTES = 5 * 1024 * 1024;

function assertSlot(slot: unknown): asserts slot is string {
  if (typeof slot !== 'string' || !SLOT_PATTERN.test(slot)) throw new Error(`不合法的存檔欄位：${String(slot)}`);
}

const files = (dir: string, slot: string) => ({
  primary: path.join(dir, `${slot}.json`),
  backup: path.join(dir, `${slot}.bak.json`),
  temp: path.join(dir, `${slot}.tmp`),
});

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
}

export async function listSaves(dir: string): Promise<{ slot: string; savedAt: string | null }[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const out: { slot: string; savedAt: string | null }[] = [];
  for (const name of names) {
    const match = /^([a-z0-9_-]{1,32})\.json$/.exec(name);
    if (!match || name.endsWith('.bak.json')) continue;
    const { mtime } = await stat(path.join(dir, name));
    out.push({ slot: match[1]!, savedAt: mtime.toISOString() });
  }
  return out;
}

/** 讀取並解析 JSON；不存在回傳 null，內容損壞時拋錯（由 renderer 決定是否改讀備份）。 */
export async function readSave(dir: string, slot: unknown, source: unknown = 'primary'): Promise<unknown> {
  assertSlot(slot);
  if (source !== 'primary' && source !== 'backup') throw new Error(`不合法的讀取來源：${String(source)}`);
  const file = files(dir, slot)[source];
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  return JSON.parse(text) as unknown;
}

/**
 * 原子寫入：寫暫存檔並 fsync → 主檔改名為備份 → 暫存檔改名為主檔。
 * 任何一步中斷，磁碟上至少保有完整的主檔或備份其中之一；不會出現寫到一半的主檔。
 */
export async function writeSave(dir: string, slot: unknown, data: unknown): Promise<void> {
  assertSlot(slot);
  const text = JSON.stringify(data);
  if (text === undefined) throw new Error('存檔內容無法序列化');
  if (Buffer.byteLength(text) > MAX_BYTES) throw new Error(`存檔超過 ${MAX_BYTES} bytes`);
  const { primary, backup, temp } = files(dir, slot);
  await mkdir(dir, { recursive: true });
  const handle = await open(temp, 'w');
  try {
    await handle.writeFile(text, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  // 先複製舊主檔為備份，再以 rename 原子取代主檔：任何時刻主檔都存在（不會有讀到「沒有主檔」的空窗）
  if (await exists(primary)) await copyFile(primary, backup);
  await rename(temp, primary);
}

/** 匯出用：回傳主檔原文 */
export async function readSaveText(dir: string, slot: unknown): Promise<string | null> {
  assertSlot(slot);
  try {
    return await readFile(files(dir, slot).primary, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/** 測試用：刪除整個存檔資料夾 */
export async function clearSaves(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}
