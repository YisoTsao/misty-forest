import { t } from '@/game/i18n';
import { useUiStore } from '@/game/state/uiStore';

/** 互動提示（規格 6.2）：「[E] 打開 寶箱」。目標改變時才重新渲染。 */
export function InteractPrompt() {
  const target = useUiStore((s) => s.interactTarget);
  if (!target) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center">
      <div
        data-testid="interact-prompt"
        className="flex items-center gap-2 rounded-full bg-black/55 py-1.5 pr-4 pl-1.5 text-base text-white shadow-lg"
      >
        <kbd className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-200 font-bold text-amber-950">E</kbd>
        <span>
          {t(`interact.${target.kind}`)} <span className="font-bold">{t(target.nameKey)}</span>
        </span>
      </div>
    </div>
  );
}
