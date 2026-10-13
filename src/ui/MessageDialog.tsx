import { useEffect } from 'react';
import { t } from '@/game/i18n';
import { useUiStore } from '@/game/state/uiStore';

/**
 * 訊息視窗（開箱結果等）。開啟時釋放滑鼠（規格 6.1：UI 開啟時釋放滑鼠）；
 * E 由互動系統處理關閉，Esc 與按鈕在這裡處理。
 */
export function MessageDialog() {
  const message = useUiStore((s) => s.message);
  const close = useUiStore((s) => s.closeMessage);

  useEffect(() => {
    if (!message) return;
    if (document.pointerLockElement) document.exitPointerLock();
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [message, close]);

  if (!message) return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
      <div
        role="dialog"
        aria-labelledby="message-title"
        data-testid="message-dialog" data-pad-scope
        className="w-[min(92vw,30rem)] rounded-2xl border-4 border-amber-200 bg-amber-50 p-6 text-amber-950 shadow-2xl"
      >
        <h2 id="message-title" className="mb-3 text-xl font-bold">
          {t(message.titleKey)}
        </h2>
        <p className="leading-7 whitespace-pre-line">{t(message.bodyKey)}</p>
        <div className="mt-5 flex items-center justify-end gap-3">
          <span className="text-xs opacity-60">{t('message.closeHint')}</span>
          <button
            type="button"
            onClick={close}
            className="rounded-full bg-amber-500 px-5 py-1.5 font-bold text-white hover:bg-amber-600"
          >
            {t('message.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
