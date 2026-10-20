import { t } from '@/game/i18n';
import { actionKey } from '@/game/input/keyLabels';
import { useBindings } from '@/game/state/settingsStore';
import { useUiStore } from '@/game/state/uiStore';
import { swallowNextClick, useTouchUi } from '@/game/input/device';
import { input } from '@/game/input/inputManager';

/** 互動提示（規格 6.2）：「[E] 打開 寶箱」。目標改變時才重新渲染。 */
export function InteractPrompt() {
  const target = useUiStore((s) => s.interactTarget);
  const key = actionKey(useBindings(), 'interact');
  // 手機版（任務 11M）：提示放在畫面中段（下方兩側是搖桿與按鈕），點一下提示也能互動
  const touch = useTouchUi();
  if (!target) return null;
  return (
    <div className={`pointer-events-none absolute inset-x-0 flex justify-center ${touch ? 'top-[58%]' : 'bottom-24'}`}>
      <div
        data-testid="interact-prompt"
        className={`flex items-center gap-2 rounded-full bg-black/55 py-1.5 pr-4 pl-1.5 text-base text-white shadow-lg ${touch ? 'pointer-events-auto' : ''}`}
        style={touch ? { touchAction: 'none' } : undefined}
        onPointerDown={
          touch
            ? (e) => {
                e.preventDefault();
                swallowNextClick();
                input.touchTap('interact');
              }
            : undefined
        }
      >
        <kbd className="flex h-7 min-w-7 items-center justify-center rounded-full bg-amber-200 px-2 font-bold text-amber-950">{key}</kbd>
        <span>
          {t(target.verbKey ?? `interact.${target.kind}`)} <span className="font-bold">{t(target.nameKey)}</span>
        </span>
      </div>
    </div>
  );
}
