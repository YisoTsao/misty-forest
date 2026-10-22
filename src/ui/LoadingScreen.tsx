import { useProgress } from '@react-three/drei';
import { useState } from 'react';
import { formatBytes, type PackProgress } from '@/game-core/assets/packs';
import { useAssetLoadStore } from '@/game/assets/assetLoader';
import { t } from '@/game/i18n';
import { useDebugStore } from '@/game/state/debugStore';

/** 下載資源包佔整條進度的比例，其餘是場景準備（解析模型、建立材質）。包壓縮後下載很快，解析反而比較久 */
const DOWNLOAD_SHARE = 0.6;

/**
 * 載入畫面（使用者 2026-10-21：重新整理後會先看到一片空白的天空與 HUD）。
 * 模型與材質還在下載、編譯時（場景還沒就緒），蓋住整個畫面並顯示下載進度；就緒後立刻卸載
 * （不做淡出：e2e 與截圖在就緒後馬上檢查畫面顏色）。不攔截點擊，e2e 與手把操作不受影響。
 * 兩段（使用者 2026-10-21，資源依種類載入）：先依種類下載資源包（各種類的大小、進度、是否從快取讀出，
 * 整體的剩餘時間），再準備場景。整條進度只增不減，場景還沒就緒時最多顯示 99%。
 * 場景準備（使用者 2026-10-21：停在「正在準備場景 99%」很久）：進度依已解析的模型數，並列出數量；
 * 模型都解析完、還在建立世界與編譯材質時改顯示那一步，不會看起來像卡住。
 */
export function LoadingScreen() {
  const ready = useDebugStore((s) => s.sceneReady);
  if (ready) return null;
  return <LoadingOverlay />;
}

function formatEta(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds));
  if (s < 60) return t('loading.seconds', { n: s });
  return t('loading.minutes', { m: Math.floor(s / 60), s: s % 60 });
}

function LoadingOverlay() {
  const phase = useAssetLoadStore((s) => s.phase);
  const packs = useAssetLoadStore((s) => s.packs);
  const summary = useAssetLoadStore((s) => s.summary);
  const modelsLoaded = useProgress((s) => s.loaded);
  const modelsTotal = useProgress((s) => s.total);
  const downloading = phase === 'manifest' || phase === 'download';
  const scene = modelsTotal > 0 ? modelsLoaded / modelsTotal : 0;
  const building = !downloading && modelsTotal > 0 && modelsLoaded >= modelsTotal;
  const raw = downloading ? summary.ratio * DOWNLOAD_SHARE * 100 : (phase === 'ready' ? DOWNLOAD_SHARE * 100 : 0) + scene * 100 * (phase === 'ready' ? 1 - DOWNLOAD_SHARE : 1);
  // 記住目前為止的最大值（依狀態推導，不在 render 中讀寫 ref）：drei 的進度每批資源會從頭算
  const [peak, setPeak] = useState(0);
  const rounded = Math.round(raw);
  if (rounded > peak) setPeak(rounded);
  const pct = Math.min(99, Math.max(peak, rounded));
  const allCached = packs.length > 0 && packs.every((p) => p.cached);

  return (
    <div
      data-testid="loading-screen"
      data-phase={phase}
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-5 bg-gradient-to-b from-sky-200 via-emerald-100 to-emerald-300 px-4 text-emerald-950"
    >
      <h1 className="text-center text-4xl font-black tracking-wider text-white drop-shadow-[0_3px_10px_rgba(20,60,90,0.45)]">{t('app.title')}</h1>
      <div className="w-[min(86vw,24rem)]">
        <div className="h-2.5 overflow-hidden rounded-full bg-white/60 shadow-inner">
          <div data-testid="loading-bar" className="h-full rounded-full bg-amber-400 transition-[width] duration-300" style={{ width: `${Math.max(4, pct)}%` }} />
        </div>
        <p className="mt-2 flex justify-between gap-3 text-sm font-bold">
          <span data-testid="loading-step">{phase === 'manifest' ? t('loading.checking') : downloading ? t('loading.world') : building ? t('loading.building') : t('loading.preparing')}</span>
          <span data-testid="loading-pct">{pct}%</span>
        </p>
        {!downloading && modelsTotal > 0 && (
          <p data-testid="loading-models" className="mt-0.5 text-xs tabular-nums opacity-80">
            {t('loading.models', { loaded: modelsLoaded, total: modelsTotal })}
          </p>
        )}
        {phase === 'download' && (
          <p data-testid="loading-eta" className="mt-0.5 flex justify-between gap-3 text-xs opacity-80">
            <span>{t('loading.downloaded', { loaded: formatBytes(summary.loadedBytes), total: formatBytes(summary.totalBytes) })}</span>
            <span>{summary.etaSeconds === null ? t('loading.etaMeasuring') : t('loading.eta', { time: formatEta(summary.etaSeconds) })}</span>
          </p>
        )}
        {/* 全部從快取讀出時不列出各種類（重新整理時的畫面不需要這些）；有要下載的才列出 */}
        {packs.length > 0 && !allCached && (
          <ul data-testid="loading-packs" className="mt-3 flex flex-col gap-1.5 rounded-xl bg-white/45 p-3 text-xs shadow-sm">
            {packs.map((p) => (
              <PackRow key={p.category} pack={p} />
            ))}
          </ul>
        )}
        {packs.length > 0 && !allCached && <p className="mt-2 text-center text-[11px] opacity-70">{t('loading.firstTime')}</p>}
      </div>
    </div>
  );
}

function PackRow({ pack }: { pack: PackProgress }) {
  const ratio = pack.bytes > 0 ? Math.min(1, pack.loaded / pack.bytes) : 1;
  const status = pack.cached ? t('loading.status.cached') : pack.done ? t('loading.status.done') : pack.loaded > 0 ? `${Math.floor(ratio * 100)}%` : t('loading.status.waiting');
  return (
    <li data-testid={`loading-pack-${pack.category}`} data-done={pack.done} data-cached={pack.cached} className="grid grid-cols-[8.5rem_1fr_3.6rem] items-center gap-2">
      <span className="truncate font-bold">
        {t(`loading.category.${pack.category}`)} <span className="font-normal opacity-60">{formatBytes(pack.bytes)}</span>
      </span>
      <span className="h-1.5 overflow-hidden rounded-full bg-white/70">
        <span className={`block h-full rounded-full ${pack.done ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${ratio * 100}%` }} />
      </span>
      <span className="text-right tabular-nums">{status}</span>
    </li>
  );
}
