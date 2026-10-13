import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSaves, listSaves, readSave, writeSave } from './saveFiles';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'mistwood-save-'));
});
afterEach(async () => {
  await clearSaves(dir);
});

describe('saveFiles', () => {
  it('寫入後可讀回；沒有存檔時回傳 null', async () => {
    expect(await readSave(dir, 'slot1')).toBeNull();
    await writeSave(dir, 'slot1', { version: 1, n: 1 });
    expect(await readSave(dir, 'slot1')).toEqual({ version: 1, n: 1 });
    expect(await readSave(dir, 'slot1', 'backup')).toBeNull();
  });

  it('覆蓋前把上一版保留為備份，不留下暫存檔', async () => {
    await writeSave(dir, 'slot1', { n: 1 });
    await writeSave(dir, 'slot1', { n: 2 });
    await writeSave(dir, 'slot1', { n: 3 });
    expect(await readSave(dir, 'slot1')).toEqual({ n: 3 });
    expect(await readSave(dir, 'slot1', 'backup')).toEqual({ n: 2 });
    expect((await readdir(dir)).sort()).toEqual(['slot1.bak.json', 'slot1.json']);
  });

  it('主檔損壞時讀取拋錯（交由呼叫端改讀備份），備份仍可讀', async () => {
    await writeSave(dir, 'slot1', { n: 1 });
    await writeSave(dir, 'slot1', { n: 2 });
    await writeFile(path.join(dir, 'slot1.json'), '{"n": 2, 壞掉');
    await expect(readSave(dir, 'slot1')).rejects.toThrow();
    expect(await readSave(dir, 'slot1', 'backup')).toEqual({ n: 1 });
  });

  it('上次寫入中斷留下的暫存檔不影響讀取，下次寫入會覆蓋它', async () => {
    await writeSave(dir, 'slot1', { n: 1 });
    await writeFile(path.join(dir, 'slot1.tmp'), '{"n": 9');
    expect(await readSave(dir, 'slot1')).toEqual({ n: 1 });
    await writeSave(dir, 'slot1', { n: 2 });
    expect(await readSave(dir, 'slot1')).toEqual({ n: 2 });
    expect(JSON.parse(await readFile(path.join(dir, 'slot1.bak.json'), 'utf8'))).toEqual({ n: 1 });
  });

  it('拒絕不合法的欄位名稱（避免路徑穿越）', async () => {
    for (const slot of ['../evil', 'a/b', '', 'UPPER', 'x'.repeat(40), 3]) {
      await expect(writeSave(dir, slot, {})).rejects.toThrow(/不合法/);
      await expect(readSave(dir, slot)).rejects.toThrow(/不合法/);
    }
  });

  it('列出存檔（不含備份）', async () => {
    expect(await listSaves(path.join(dir, 'missing'))).toEqual([]);
    await writeSave(dir, 'slot1', {});
    await writeSave(dir, 'slot1', {});
    await writeSave(dir, 'settings', {});
    const slots = (await listSaves(dir)).map((s) => s.slot).sort();
    expect(slots).toEqual(['settings', 'slot1']);
  });
});
