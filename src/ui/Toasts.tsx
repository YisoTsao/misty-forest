import { useEffect } from 'react';
import { t } from '@/game/i18n';
import { useUiStore, type Toast } from '@/game/state/uiStore';
import { worldDataResult } from '@/game/worldData';
import { useNetStore } from '@/net/netStore';
import { ItemIcon } from './ItemIcon';

/** 通知停留時間（毫秒） */
const TOAST_MS = 2600;

/** 畫面左側的短暫通知：取得物品、背包已滿等（規格 6.2：更新世界與 UI）。 */
export function Toasts() {
  const toasts = useUiStore((s) => s.toasts);
  // 多人連線時左下角是聊天紀錄（任務 11F），通知往上移
  const chat = useNetStore((s) => s.status !== 'offline');
  return (
    <div className={`pointer-events-none absolute left-6 flex flex-col items-start gap-2 ${chat ? 'bottom-[20rem]' : 'bottom-40'}`} data-testid="toasts">
      {toasts.map((toast) => (
        <ToastRow key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function ToastRow({ toast }: { toast: Toast }) {
  const dismiss = useUiStore((s) => s.dismissToast);
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(toast.id), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast.id, dismiss]);

  const item = toast.itemId && worldDataResult.ok ? worldDataResult.data.items.get(toast.itemId) : undefined;
  return (
    <div data-testid="toast" className="animate-toast flex items-center gap-2 rounded-full bg-black/55 py-1 pr-4 pl-1 text-white shadow-lg">
      {item ? (
        <>
          <ItemIcon icon={item.icon} className="h-8 w-8 rounded-full bg-amber-50/90 p-0.5" />
          <span>
            {t('toast.obtained')} <span className="font-bold">{t(item.nameKey)}</span> ×{toast.count}
          </span>
        </>
      ) : (
        <span className="px-3 py-1">{t(toast.textKey ?? '', toast.vars)}</span>
      )}
    </div>
  );
}
