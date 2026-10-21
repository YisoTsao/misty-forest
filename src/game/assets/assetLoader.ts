// 資源包的下載與快取（格式見 game-core/assets/packs.ts）。
// 依種類下載建置時打好的包，存進 Cache Storage（重新整理、下次開啟直接讀出，不再下載），
// 再把每個原本的檔案網址對應到包裡那一段的 blob 網址：Three.js 的載入器（useGLTF、貼圖）透過
// DefaultLoadingManager 的網址轉換、音效透過 resolveAssetUrl，程式其他地方照舊用 assetUrl() 的路徑。
// 清單讀不到（開發伺服器）、包下載失敗時改回逐檔載入，遊戲照常進行。
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { create } from 'zustand';
import { mimeOf, parseManifest, PACK_MANIFEST_FILE, summarize, type AssetPack, type LoadSummary, type PackProgress } from '@/game-core/assets/packs';

/** 快取的名稱；格式不相容時改版號，舊的會在下次啟動時刪掉（v2：包改為 gzip，快取存解壓後的內容） */
const CACHE_NAME = 'mistwood-asset-packs-v2';
/** 同時下載的包數（太多會互搶頻寬，個別的進度看起來都很慢） */
const CONCURRENCY = 2;

export type AssetLoadPhase = 'manifest' | 'download' | 'ready' | 'direct';

export type AssetLoadState = {
  phase: AssetLoadPhase;
  packs: PackProgress[];
  summary: LoadSummary;
  /** 這次從網路下載的位元組數（從快取讀出的不算） */
  networkBytes: number;
  startedAt: number;
};

const emptySummary: LoadSummary = { totalBytes: 0, loadedBytes: 0, ratio: 0, etaSeconds: null };

export const useAssetLoadStore = create<AssetLoadState>(() => ({
  phase: 'manifest',
  packs: [],
  summary: emptySummary,
  networkBytes: 0,
  startedAt: 0,
}));

/** 原本檔案的絕對網址 → 包裡那一段的 blob 網址 */
const blobUrls = new Map<string, string>();

function absolute(url: string): string {
  try {
    return new URL(url, document.baseURI).href;
  } catch {
    return url;
  }
}

/** 原本的資源網址（assetUrl() 的結果或其相對路徑）在包裡就換成 blob 網址，否則原樣 */
export function resolveAssetUrl(url: string): string {
  if (blobUrls.size === 0 || url.startsWith('blob:') || url.startsWith('data:')) return url;
  return blobUrls.get(absolute(url)) ?? url;
}

let readyResolve: () => void = () => {};
/** 資源包處理完（成功或改回逐檔載入）才會 resolve；場景與音效在這之後才開始載入 */
export const assetsReady = new Promise<void>((resolve) => (readyResolve = resolve));

function finish(phase: 'ready' | 'direct'): void {
  useAssetLoadStore.setState({ phase });
  readyResolve();
}

function update(category: string, patch: Partial<PackProgress>, networkDelta = 0): void {
  useAssetLoadStore.setState((s) => {
    const packs = s.packs.map((p) => (p.category === category ? { ...p, ...patch } : p));
    const networkBytes = s.networkBytes + networkDelta;
    return { packs, networkBytes, summary: summarize(packs, networkBytes, (performance.now() - s.startedAt) / 1000) };
  });
}

async function openCache(): Promise<Cache | null> {
  try {
    if (typeof caches === 'undefined') return null;
    return await caches.open(CACHE_NAME);
  } catch {
    // file://（桌面版）、隱私模式、使用者封鎖網站資料：不快取，每次讀檔（桌面版本來就是本機檔案）
    return null;
  }
}

/** 快取的鍵要是 http(s) 網址；桌面版（file://）用固定的假網址，只當作識別 */
function cacheKey(file: string): string {
  const href = absolute(file);
  return href.startsWith('http') ? href : `https://mistwood.local/${file}`;
}

/** 下載一個包，邊讀邊更新進度（以下載的壓縮後位元組計）、邊解壓；讀完把解壓後的內容存進快取 */
async function download(pack: AssetPack, cache: Cache | null): Promise<Blob> {
  const res = await fetch(absolute(pack.file));
  if (!res.ok || !res.body) throw new Error(`${pack.file}: ${res.status}`);
  if (pack.encoding === 'gzip' && typeof DecompressionStream === 'undefined') throw new Error('瀏覽器不支援 DecompressionStream');
  let loaded = 0;
  let reported = 0;
  let lastReport = 0;
  const report = () => {
    update(pack.category, { loaded }, loaded - reported);
    reported = loaded;
  };
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctrl) {
      loaded += chunk.byteLength;
      const now = performance.now();
      // 進度最多每 100 ms 更新一次畫面
      if (now - lastReport > 100) {
        report();
        lastReport = now;
      }
      ctrl.enqueue(chunk);
    },
  });
  let stream: ReadableStream<Uint8Array> = res.body.pipeThrough(counter);
  if (pack.encoding === 'gzip') stream = stream.pipeThrough(new DecompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>);
  const raw = await new Response(stream).arrayBuffer();
  report();
  if (loaded !== pack.bytes || raw.byteLength !== pack.size) throw new Error(`${pack.file}: 大小不符（下載 ${loaded} / ${pack.bytes}，解壓 ${raw.byteLength} / ${pack.size}）`);
  const blob = new Blob([raw], { type: 'application/octet-stream' });
  if (cache) {
    try {
      await cache.put(cacheKey(pack.file), new Response(blob, { headers: { 'Content-Length': String(blob.size) } }));
    } catch (err) {
      // 空間不足等：這次照常使用，下次重新下載
      console.warn('[assets] 無法存進快取：', err);
    }
  }
  return blob;
}

async function loadPack(pack: AssetPack, cache: Cache | null): Promise<void> {
  let blob: Blob | null = null;
  if (cache) {
    try {
      const hit = await cache.match(cacheKey(pack.file));
      if (hit) {
        const b = await hit.blob();
        if (b.size === pack.size) blob = b;
      }
    } catch {
      blob = null;
    }
    if (blob) update(pack.category, { cached: true, loaded: pack.bytes });
  }
  blob ??= await download(pack, cache);
  // Blob.slice 不複製資料，每個檔案只是包的一段
  for (const e of pack.entries) {
    blobUrls.set(absolute(`${import.meta.env.BASE_URL}${e.path}`), URL.createObjectURL(blob.slice(e.offset, e.offset + e.length, mimeOf(e.path))));
  }
  update(pack.category, { done: true, loaded: pack.bytes });
}

/** 刪掉快取裡已經不在清單上的舊包（改版後內容雜湊變了） */
async function pruneCache(cache: Cache, packs: readonly AssetPack[]): Promise<void> {
  const keep = new Set(packs.map((p) => cacheKey(p.file)));
  for (const req of await cache.keys()) if (!keep.has(req.url)) await cache.delete(req);
  for (const name of await caches.keys()) if (name.startsWith('mistwood-asset-packs-') && name !== CACHE_NAME) await caches.delete(name);
}

/**
 * 所有模型一次同時開始解析（使用者 2026-10-21：按「開始遊玩」後停在「正在準備場景 99%」很久）。
 * React 19 的 Suspense 在一個元件暫停後不會繼續渲染它後面的元件，各處的 useGLTF 變成一個接一個載入
 * （約 150 個模型，每秒四、五個）；先 preload 進 useGLTF 的快取，元件掛上時就直接拿到。
 * 快取的鍵是原本的網址（與 assetUrl() 相同），實際讀的是包裡的 blob。
 */
function preloadModels(packs: readonly AssetPack[]): void {
  for (const p of packs) for (const e of p.entries) if (/\.(glb|gltf)$/i.test(e.path)) useGLTF.preload(`${import.meta.env.BASE_URL}${e.path}`);
}

let started = false;

/** 啟動時呼叫一次：下載（或從快取讀出）所有資源包 */
export function startAssetLoading(): Promise<void> {
  if (started) return assetsReady;
  started = true;
  // Three.js 的所有載入器（GLTFLoader、貼圖）都經過預設的 LoadingManager
  THREE.DefaultLoadingManager.setURLModifier(resolveAssetUrl);
  void (async () => {
    useAssetLoadStore.setState({ startedAt: performance.now() });
    let manifest = null;
    try {
      // 清單很小，每次都向伺服器確認（包的檔名含雜湊，清單變了才會下載新的包）
      const res = await fetch(absolute(PACK_MANIFEST_FILE), { cache: 'no-cache' });
      if (res.ok) manifest = parseManifest(await res.json());
    } catch {
      manifest = null;
    }
    if (!manifest || manifest.packs.length === 0) {
      finish('direct');
      return;
    }
    const packs: PackProgress[] = manifest.packs.map((p) => ({ category: p.category, bytes: p.bytes, loaded: 0, cached: false, done: false }));
    useAssetLoadStore.setState({ phase: 'download', packs, summary: summarize(packs, 0, 0), startedAt: performance.now() });
    const cache = await openCache();
    const queue = [...manifest.packs];
    try {
      await Promise.all(
        Array.from({ length: CONCURRENCY }, async () => {
          for (let pack = queue.shift(); pack; pack = queue.shift()) await loadPack(pack, cache);
        }),
      );
    } catch (err) {
      // 已經對應好的檔案照常用包裡的，其餘逐檔載入
      console.error('[assets] 資源包下載失敗，改為逐檔載入：', err);
      finish('direct');
      return;
    }
    if (cache) void pruneCache(cache, manifest.packs).catch(() => {});
    preloadModels(manifest.packs);
    finish('ready');
  })();
  return assetsReady;
}

/** e2e：目前的載入結果 */
export function assetLoadReport(): { phase: AssetLoadPhase; packs: PackProgress[]; networkBytes: number; mapped: number } {
  const s = useAssetLoadStore.getState();
  return { phase: s.phase, packs: s.packs, networkBytes: s.networkBytes, mapped: blobUrls.size };
}
