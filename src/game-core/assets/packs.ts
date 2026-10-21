// 資源包（使用者 2026-10-21：每次重新整理都要下載幾百個零散的模型與音效檔）：
// 建置時（開發伺服器也是）把 public/models、public/audio 依種類打包成幾個 gzip 壓縮的檔案（vite 外掛 scripts/assetPacks.ts），
// 遊戲啟動時依種類下載、顯示進度與剩餘時間，並存進瀏覽器的 Cache Storage，重新整理時不必再下載。
// 這裡是建置端與遊戲端共用的純函式：分類、打包格式、清單驗證、進度與剩餘時間的計算。
import { z } from 'zod';

/** 資源種類（依下載順序：先角色與怪物，最大的先開始） */
export const assetCategories = ['characters', 'monsters', 'buildings', 'nature', 'audio'] as const;
export type AssetCategory = (typeof assetCategories)[number];

/** 檔案路徑（相對 public/，例如 models/monsters/x.glb）屬於哪一種；不打包的檔案（授權說明等）回傳 null */
export function categoryOf(path: string): AssetCategory | null {
  if (!/\.(glb|gltf|bin|png|jpe?g|webp|ktx2|ogg|mp3|wav)$/i.test(path)) return null;
  if (path.startsWith('audio/')) return 'audio';
  if (path.startsWith('models/characters/')) return 'characters';
  if (path.startsWith('models/monsters/')) return 'monsters';
  if (path.startsWith('models/kenney-nature/')) return 'nature';
  if (path.startsWith('models/')) return 'buildings';
  return null;
}

/** 依副檔名決定 Blob 的 MIME 類型（GLTFLoader 與 decodeAudioData 不看類型，但圖片需要） */
export function mimeOf(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  const types: Record<string, string> = {
    glb: 'model/gltf-binary',
    gltf: 'model/gltf+json',
    bin: 'application/octet-stream',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    ktx2: 'image/ktx2',
    ogg: 'audio/ogg',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
  };
  return types[ext] ?? 'application/octet-stream';
}

const entrySchema = z.object({
  /** 相對 public/ 的路徑，與 assetUrl() 用的路徑相同 */
  path: z.string().min(1),
  offset: z.number().int().nonnegative(),
  length: z.number().int().nonnegative(),
});
export type PackEntry = z.infer<typeof entrySchema>;

/** 包的壓縮方式：gzip（瀏覽器內建的 DecompressionStream 解壓）或不壓縮 */
export const packEncodings = ['gzip', 'identity'] as const;
export type PackEncoding = (typeof packEncodings)[number];

const packSchema = z.object({
  category: z.enum(assetCategories),
  /** 相對 public/ 的檔名，含內容雜湊（內容變了檔名就變，可以永久快取） */
  file: z.string().min(1),
  /** 要下載的位元組數（壓縮後） */
  bytes: z.number().int().nonnegative(),
  encoding: z.enum(packEncodings),
  /** 解壓後的位元組數；各檔案的位置以解壓後為準 */
  size: z.number().int().nonnegative(),
  entries: z.array(entrySchema),
});
export type AssetPack = z.infer<typeof packSchema>;

export const PACK_MANIFEST_VERSION = 2;
export const PACK_MANIFEST_FILE = 'packs/manifest.json';

const manifestSchema = z.object({
  version: z.literal(PACK_MANIFEST_VERSION),
  packs: z.array(packSchema),
});
export type PackManifest = z.infer<typeof manifestSchema>;

/** 驗證下載到的清單；格式不對（例如開發伺服器回了 index.html）回傳 null，改為逐檔載入 */
export function parseManifest(value: unknown): PackManifest | null {
  const r = manifestSchema.safeParse(value);
  if (!r.success) return null;
  // 每個檔案的範圍要在包裡面；不壓縮的包下載大小就是解壓後大小
  for (const p of r.data.packs) {
    if (p.encoding === 'identity' && p.bytes !== p.size) return null;
    for (const e of p.entries) if (e.offset + e.length > p.size) return null;
  }
  return r.data;
}

/** 壓縮後至少要省下這個比例才壓縮（已經壓過的音效省不了多少，解壓反而多花時間） */
export const MIN_GZIP_SAVING = 0.1;

/** 依壓縮前後的大小決定包的壓縮方式 */
export function chooseEncoding(rawBytes: number, gzipBytes: number): PackEncoding {
  return gzipBytes <= rawBytes * (1 - MIN_GZIP_SAVING) ? 'gzip' : 'identity';
}

/**
 * 把同一種類的檔案接成一個包：內容直接首尾相接（整個包再 gzip，見 chooseEncoding），
 * 位置記在清單裡。依路徑排序，同樣的內容每次都得到同樣的包（雜湊不變、快取不失效）。
 */
export function buildPack(files: readonly { path: string; data: Uint8Array }[]): { data: Uint8Array; entries: PackEntry[] } {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const total = sorted.reduce((n, f) => n + f.data.byteLength, 0);
  const data = new Uint8Array(total);
  const entries: PackEntry[] = [];
  let offset = 0;
  for (const f of sorted) {
    data.set(f.data, offset);
    entries.push({ path: f.path, offset, length: f.data.byteLength });
    offset += f.data.byteLength;
  }
  return { data, entries };
}

/** 各種類目前的下載狀態 */
export type PackProgress = {
  category: AssetCategory;
  /** 要下載的位元組數（壓縮後） */
  bytes: number;
  loaded: number;
  /** 從瀏覽器快取讀出（不用下載） */
  cached: boolean;
  done: boolean;
};

export type LoadSummary = {
  totalBytes: number;
  loadedBytes: number;
  /** 0–1 */
  ratio: number;
  /** 預估剩餘秒數；還量不到速度（剛開始、全部從快取讀出）時是 null */
  etaSeconds: number | null;
};

/**
 * 整體進度與剩餘時間：速度只算從網路下載的部分（從快取讀出的幾乎是瞬間，算進去會讓剩餘時間失準），
 * 下載不到 0.5 秒或不到 64 KB 時還不估計。
 */
export function summarize(packs: readonly PackProgress[], networkBytes: number, elapsedSeconds: number): LoadSummary {
  const totalBytes = packs.reduce((n, p) => n + p.bytes, 0);
  const loadedBytes = packs.reduce((n, p) => n + (p.done ? p.bytes : Math.min(p.loaded, p.bytes)), 0);
  const ratio = totalBytes > 0 ? loadedBytes / totalBytes : 1;
  const remaining = totalBytes - loadedBytes;
  let etaSeconds: number | null = null;
  if (remaining <= 0) etaSeconds = 0;
  else if (elapsedSeconds >= 0.5 && networkBytes >= 64 * 1024) etaSeconds = remaining / (networkBytes / elapsedSeconds);
  return { totalBytes, loadedBytes, ratio, etaSeconds };
}

/** 位元組數的顯示（MB 取一位小數，小於 1 MB 用 KB） */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
