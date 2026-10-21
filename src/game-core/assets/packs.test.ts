import { describe, expect, it } from 'vitest';
import { buildPack, categoryOf, chooseEncoding, parseManifest, PACK_MANIFEST_VERSION, summarize, type PackProgress } from './packs';

const bytes = (...n: number[]) => new Uint8Array(n);

describe('資源包', () => {
  it('依路徑分類，授權說明等不打包', () => {
    expect(categoryOf('models/characters/kaykit-adventurers/Knight.glb')).toBe('characters');
    expect(categoryOf('models/monsters/slime.glb')).toBe('monsters');
    expect(categoryOf('models/kenney-nature/tree.glb')).toBe('nature');
    expect(categoryOf('models/kaykit-furniture/table.gltf')).toBe('buildings');
    expect(categoryOf('models/kaykit-furniture/furniturebits_texture.png')).toBe('buildings');
    expect(categoryOf('audio/kenney/click_001.ogg')).toBe('audio');
    expect(categoryOf('models/kenney-nature/LICENSE.txt')).toBeNull();
    expect(categoryOf('manifest.webmanifest')).toBeNull();
  });

  it('打包後每個檔案的範圍取回的內容與原檔相同，順序與輸入無關', () => {
    const files = [
      { path: 'b.glb', data: bytes(4, 5) },
      { path: 'a.glb', data: bytes(1, 2, 3) },
    ];
    const pack = buildPack(files);
    expect(pack.data).toEqual(bytes(1, 2, 3, 4, 5));
    for (const f of files) {
      const e = pack.entries.find((x) => x.path === f.path)!;
      expect(pack.data.slice(e.offset, e.offset + e.length)).toEqual(f.data);
    }
    expect(buildPack([...files].reverse()).data).toEqual(pack.data);
  });

  it('清單格式不對或範圍超出包的大小時不採用（改逐檔載入）', () => {
    const pack = { category: 'audio', file: 'packs/audio.abc.bin', bytes: 5, encoding: 'identity', size: 5, entries: [{ path: 'audio/a.ogg', offset: 0, length: 5 }] };
    const good = { version: PACK_MANIFEST_VERSION, packs: [pack] };
    expect(parseManifest(good)).not.toBeNull();
    expect(parseManifest('<!doctype html>')).toBeNull();
    expect(parseManifest({ ...good, version: 99 })).toBeNull();
    expect(parseManifest({ ...good, packs: [{ ...pack, bytes: 4, size: 4 }] })).toBeNull();
    // 不壓縮的包，下載大小要等於解壓後大小
    expect(parseManifest({ ...good, packs: [{ ...pack, bytes: 3 }] })).toBeNull();
    // gzip 的包：下載大小比較小，範圍以解壓後大小檢查
    expect(parseManifest({ ...good, packs: [{ ...pack, encoding: 'gzip', bytes: 3 }] })).not.toBeNull();
    expect(parseManifest({ ...good, packs: [{ ...pack, encoding: 'br', bytes: 3 }] })).toBeNull();
  });

  it('壓縮省不到一成就不壓縮（已經壓過的音效）', () => {
    expect(chooseEncoding(1000, 300)).toBe('gzip');
    expect(chooseEncoding(1000, 900)).toBe('gzip');
    expect(chooseEncoding(1000, 950)).toBe('identity');
  });

  it('剩餘時間只依網路下載的速度估計，從快取讀出的不算', () => {
    const packs: PackProgress[] = [
      { category: 'characters', bytes: 10_000_000, loaded: 2_000_000, cached: false, done: false },
      { category: 'audio', bytes: 1_000_000, loaded: 1_000_000, cached: true, done: true },
    ];
    // 2 秒下載 2 MB → 1 MB/s，剩 8 MB → 8 秒
    const s = summarize(packs, 2_000_000, 2);
    expect(s.loadedBytes).toBe(3_000_000);
    expect(s.ratio).toBeCloseTo(3 / 11);
    expect(s.etaSeconds).toBeCloseTo(8);
    // 剛開始還量不到速度
    expect(summarize(packs, 10_000, 0.2).etaSeconds).toBeNull();
    // 全部完成
    expect(summarize(packs.map((p) => ({ ...p, done: true })), 0, 0).etaSeconds).toBe(0);
  });
});
