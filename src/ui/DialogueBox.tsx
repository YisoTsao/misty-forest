import { useEffect } from 'react';
import { advanceTalk, currentDialogueView, endTalk } from '@/game/dialogueController';
import { t } from '@/game/i18n';
import { input } from '@/game/input/inputManager';
import { keyVars } from '@/game/input/keyLabels';
import { useGameStore } from '@/game/state/gameStore';
import { useGameStateStore } from '@/game/state/gameStateStore';
import { useBindings } from '@/game/state/settingsStore';
import { useUiStore } from '@/game/state/uiStore';

/**
 * NPC 對話視窗（規格 6.4）：說話者、文字、選項。
 * 互動鍵 / 空白鍵 / Enter / 點擊繼續；數字鍵或點擊選擇選項；Esc 結束對話。
 */
export function DialogueBox() {
  const active = useUiStore((s) => s.dialogue);
  const playing = useGameStore((s) => s.screen === 'playing');
  // 回到主選單或開始新的一局時結束對話
  useEffect(() => {
    if (!playing && useGameStore.getState().screen === 'title') endTalk();
  }, [playing]);
  if (!active || !playing) return null;
  return <DialogueWindow key={`${active.dialogueId}:${active.nodeId}`} />;
}

function DialogueWindow() {
  // 選項條件依權威狀態（例如持有物品）；狀態改變時重新計算
  useGameStateStore((s) => s.state);
  const bindings = useBindings();
  const view = currentDialogueView();

  useEffect(() => {
    if (document.pointerLockElement) document.exitPointerLock();
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !view) return;
      if (e.code === 'Escape') {
        e.stopImmediatePropagation();
        endTalk();
        return;
      }
      if (view.options) {
        const n = /^(?:Digit|Numpad)([1-9])$/.exec(e.code)?.[1];
        const option = n ? view.options[Number(n) - 1] : undefined;
        if (option) advanceTalk(option.index);
        return;
      }
      if (e.code === 'Space' || e.code === 'Enter' || input.isBound(e.code, 'interact')) {
        e.preventDefault();
        advanceTalk();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);

  if (!view) return null;
  return (
    <div className="absolute inset-x-0 bottom-8 flex justify-center px-4">
      <div
        role="dialog"
        aria-label={view.speakerKey ? t(view.speakerKey) : undefined}
        data-testid="dialogue" data-pad-scope
        data-node={view.nodeId}
        onClick={view.options ? undefined : () => advanceTalk()}
        className={`relative w-[min(94vw,46rem)] rounded-2xl border-4 border-amber-200 bg-amber-50/95 px-7 pt-7 pb-5 text-amber-950 shadow-2xl ${
          view.options ? '' : 'cursor-pointer'
        }`}
      >
        {view.speakerKey && (
          <span className="absolute -top-4 left-6 rounded-full bg-amber-500 px-4 py-1 text-sm font-bold text-white shadow" data-testid="dialogue-speaker">
            {t(view.speakerKey)}
          </span>
        )}
        <p className="min-h-14 text-lg leading-8 whitespace-pre-line" data-testid="dialogue-text">
          {t(view.textKey, keyVars(bindings))}
        </p>
        {view.options ? (
          <div className="mt-3 flex flex-col gap-2">
            {view.options.map((o, i) => (
              <button
                key={o.index}
                type="button"
                data-testid="dialogue-option"
                onClick={() => advanceTalk(o.index)}
                className="flex items-center gap-3 rounded-xl bg-white/80 px-4 py-2 text-left hover:bg-amber-200"
              >
                <kbd className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-200 text-sm font-bold">{i + 1}</kbd>
                <span>{t(o.textKey)}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-right text-xs opacity-60">{t('dialogue.continueHint', keyVars(bindings))}</p>
        )}
      </div>
    </div>
  );
}
