import { dismissCompanionBubble, useCompanionBubble } from '@/game/companion/companionRuntime';
import { swallowNextClick } from '@/game/input/device';
import { t } from '@/game/i18n';
import { useGameStore } from '@/game/state/gameStore';
import { useGameStateStore } from '@/game/state/gameStateStore';

/** 露米的對話泡泡：位置由 Companion（R3F）每幀寫入 transform，這裡只負責內容。點一下泡泡就關閉。 */
export function CompanionBubble() {
  const text = useCompanionBubble((s) => s.text);
  const id = useCompanionBubble((s) => s.id);
  const playing = useGameStore((s) => s.screen === 'playing');
  const unlocked = useGameStateStore((s) => s.state.companion.unlocked);
  return (
    <div id="companion-bubble" className="pointer-events-none absolute top-0 left-0" style={{ visibility: 'hidden' }}>
      {text && playing && unlocked && (
        <div
          key={id}
          data-testid="companion-bubble"
          onPointerDown={(e) => {
            // 按下就關閉，並吞掉隨後的 click（不要落到 3D 畫面變成攻擊）
            e.preventDefault();
            e.stopPropagation();
            swallowNextClick();
            dismissCompanionBubble();
          }}
          className="pointer-events-auto animate-toast mb-2 max-w-72 cursor-pointer rounded-2xl bg-white/95 px-4 py-2 text-sm leading-6 whitespace-pre-line text-amber-950 shadow-lg">
          <span className="mb-0.5 block text-xs font-bold text-amber-600">{t('companion.name')}</span>
          {text}
        </div>
      )}
    </div>
  );
}
