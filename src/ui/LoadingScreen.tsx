import { useProgress } from '@react-three/drei';
import { t } from '@/game/i18n';
import { useDebugStore } from '@/game/state/debugStore';

/**
 * 載入畫面（使用者 2026-10-21：重新整理後會先看到一片空白的天空與 HUD）。
 * 模型與材質還在下載、編譯時（場景還沒就緒），蓋住整個畫面並顯示下載進度；就緒後立刻卸載
 * （不做淡出：e2e 與截圖在就緒後馬上檢查畫面顏色）。不攔截點擊，e2e 與手把操作不受影響。
 */
export function LoadingScreen() {
  const ready = useDebugStore((s) => s.sceneReady);
  if (ready) return null;
  return <LoadingOverlay />;
}

function LoadingOverlay() {
  const pct = Math.round(useProgress((s) => s.progress));
  return (
    <div
      data-testid="loading-screen"
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-5 bg-gradient-to-b from-sky-200 via-emerald-100 to-emerald-300 text-emerald-950"
    >
      <h1 className="text-center text-4xl font-black tracking-wider text-white drop-shadow-[0_3px_10px_rgba(20,60,90,0.45)]">{t('app.title')}</h1>
      <div className="w-[min(70vw,20rem)]">
        <div className="h-2.5 overflow-hidden rounded-full bg-white/60 shadow-inner">
          <div className="h-full rounded-full bg-amber-400 transition-[width] duration-300" style={{ width: `${Math.max(4, pct)}%` }} />
        </div>
        <p className="mt-2 text-center text-sm font-bold">
          {t('loading.world')} {pct < 100 ? `${pct}%` : ''}
        </p>
      </div>
    </div>
  );
}
