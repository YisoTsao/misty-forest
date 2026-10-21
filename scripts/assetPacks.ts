// Vite 外掛：把 public/ 裡的模型與音效依種類打包並 gzip（格式見 src/game-core/assets/packs.ts）。
// 建置時輸出 dist/packs/<種類>.<內容雜湊>.bin 與 dist/packs/manifest.json，原本的零散檔案照常複製到 dist
// （清單讀不到或包下載失敗時遊戲會改回逐檔載入）。
// 開發伺服器（使用者 2026-10-21：vite dev 每次重新整理都逐檔讀幾百個檔案、沒有快取）也提供同樣的包：
// 第一次請求清單時在記憶體裡打包，public/ 的檔案有變動時重新打包（雜湊跟著變，瀏覽器快取的舊包會被換掉）。
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import type { Plugin } from 'vite';
import {
  assetCategories,
  buildPack,
  categoryOf,
  chooseEncoding,
  PACK_MANIFEST_FILE,
  PACK_MANIFEST_VERSION,
  type AssetCategory,
  type AssetPack,
  type PackManifest,
} from '../src/game-core/assets/packs';

function walk(dir: string, root: string, out: string[]): void {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, root, out);
    else out.push(path.relative(root, full).split(path.sep).join('/'));
  }
}

/** 要打包的檔案（相對 public/） */
function packedFiles(publicDir: string): string[] {
  const files: string[] = [];
  walk(publicDir, publicDir, files);
  return files.filter((f) => categoryOf(f) !== null).sort();
}

type BuiltPacks = { manifest: PackManifest; files: Map<string, Uint8Array> };

function buildPacks(publicDir: string, level: number): BuiltPacks {
  const groups = new Map<AssetCategory, { path: string; data: Uint8Array }[]>();
  for (const file of packedFiles(publicDir)) {
    const category = categoryOf(file)!;
    const list = groups.get(category) ?? [];
    list.push({ path: file, data: new Uint8Array(readFileSync(path.join(publicDir, file))) });
    groups.set(category, list);
  }
  const packs: AssetPack[] = [];
  const files = new Map<string, Uint8Array>();
  for (const category of assetCategories) {
    const list = groups.get(category);
    if (!list?.length) continue;
    const { data, entries } = buildPack(list);
    // 雜湊依解壓後的內容：壓縮等級不同（開發 / 建置）不影響檔名
    const hash = createHash('sha256').update(data).digest('hex').slice(0, 12);
    const file = `packs/${category}.${hash}.bin`;
    const gz = new Uint8Array(gzipSync(data, { level }));
    const encoding = chooseEncoding(data.byteLength, gz.byteLength);
    const out = encoding === 'gzip' ? gz : data;
    files.set(file, out);
    packs.push({ category, file, bytes: out.byteLength, encoding, size: data.byteLength, entries });
  }
  return { manifest: { version: PACK_MANIFEST_VERSION, packs }, files };
}

/** public/ 裡要打包的檔案的名稱、大小與修改時間（變了才重新打包） */
function signature(publicDir: string): string {
  return packedFiles(publicDir)
    .map((f) => {
      const st = statSync(path.join(publicDir, f));
      return `${f}:${st.size}:${st.mtimeMs}`;
    })
    .join('|');
}

export function assetPacks(publicDir = 'public'): Plugin {
  let dev: { sig: string; packs: BuiltPacks } | null = null;
  const devPacks = (): BuiltPacks => {
    const sig = signature(publicDir);
    if (dev?.sig !== sig) dev = { sig, packs: buildPacks(publicDir, 6) };
    return dev.packs;
  };
  return {
    name: 'mistwood-asset-packs',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0]!;
        if (!pathname.startsWith('/packs/')) return next();
        const file = pathname.slice(1);
        try {
          if (file === PACK_MANIFEST_FILE) {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-cache');
            res.end(JSON.stringify(devPacks().manifest));
            return;
          }
          const data = devPacks().files.get(file);
          if (!data) {
            res.statusCode = 404;
            res.end();
            return;
          }
          res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('Content-Length', String(data.byteLength));
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          res.end(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
        } catch (err) {
          next(err);
        }
      });
    },
    generateBundle() {
      const { manifest, files } = buildPacks(publicDir, 9);
      for (const [fileName, source] of files) this.emitFile({ type: 'asset', fileName, source });
      this.emitFile({ type: 'asset', fileName: PACK_MANIFEST_FILE, source: JSON.stringify(manifest) });
    },
  };
}
