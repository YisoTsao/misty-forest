import { useEffect, useState } from 'react';
import { tutorialSteps } from '@/game-core/tutorial/tutorial';
import { authority } from '@/game/authority';
import { t } from '@/game/i18n';
import { keyVars } from '@/game/input/keyLabels';
import { useGameStore } from '@/game/state/gameStore';
import { useGameStateStore } from '@/game/state/gameStateStore';
import { useBindings } from '@/game/state/settingsStore';
import { swallowNextClick, useTouchUi } from '@/game/input/device';

/** 完成全部步驟後，結語顯示多久（毫秒） */
const OUTRO_MS = 9000;
const steps = tutorialSteps.filter((s) => s !== 'done');

/** 教學提示（畫面上方）：目前步驟的說明與進度點。只在遊玩中顯示。 */
export function TutorialPanel() {
  const step = useGameStateStore((s) => s.state.tutorial);
  const playing = useGameStore((s) => s.screen === 'playing');
  const session = useGameStore((s) => s.session);
  const bindings = useBindings();
  // 手機版（任務 11M）：直向放在血條與小地圖下面，橫向放在兩者之間；「移動」那一步換成觸控的說明
  const touch = useTouchUi();
  /** 結語：記錄是在哪一局完成的，換局（回主選單再開始）後不再顯示 */
  const [outro, setOutro] = useState<{ session: number } | null>(null);
  /** 點一下就收起目前這一步的提示（進到下一步再顯示；使用者 2026-10-21：提示框都要可以點擊關閉） */
  const [hidden, setHidden] = useState<string | null>(null);

  // 在這一局內剛完成最後一步時，顯示結語一段時間（讀取已完成教學的存檔不顯示）
  useEffect(
    () =>
      authority.subscribe((events) => {
        if (events.some((e) => e.type === 'TutorialAdvanced' && e.step === 'done')) setOutro({ session: useGameStore.getState().session });
      }),
    [],
  );
  useEffect(() => {
    if (!outro) return;
    const timer = window.setTimeout(() => setOutro(null), OUTRO_MS);
    return () => window.clearTimeout(timer);
  }, [outro]);

  const showOutro = step === 'done' && outro?.session === session;
  if (!playing || (step === 'done' && !showOutro) || hidden === `${session}:${step}`) return null;
  const index = steps.indexOf(step as (typeof steps)[number]);

  return (
    <div className={`pointer-events-none absolute inset-x-0 flex justify-center ${touch ? 'portrait:top-[256px] portrait:pr-16 landscape:top-[3.75rem] px-3' : 'top-5'}`}>
      <div
        data-testid="tutorial"
        data-step={step}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          swallowNextClick();
          if (showOutro) setOutro(null);
          else setHidden(`${session}:${step}`);
        }}
        className={`pointer-events-auto cursor-pointer animate-toast rounded-2xl border-2 border-amber-200/80 bg-amber-50/92 text-amber-950 shadow-lg ${touch ? 'max-w-[min(30rem,100%)] px-4 py-2 text-sm landscape:max-w-[calc(100%-28rem)]' : 'max-w-[34rem] px-5 py-3'}`}
      >
        <div className="mb-1 flex items-center gap-2 text-xs font-bold tracking-wide text-amber-700">
          <span>{t(showOutro ? 'tutorial.outroTitle' : 'tutorial.title')}</span>
          {!showOutro && (
            <span className="flex gap-1" aria-hidden="true">
              {steps.map((s, i) => (
                <span key={s} className={`h-1.5 w-4 rounded-full ${i < index ? 'bg-amber-500' : i === index ? 'bg-amber-400 animate-pulse' : 'bg-amber-200'}`} />
              ))}
            </span>
          )}
        </div>
        <p className="leading-6 whitespace-pre-line">{t(touch && step === 'move' ? 'tutorial.moveTouch' : `tutorial.${step}`, keyVars(bindings))}</p>
      </div>
    </div>
  );
}
