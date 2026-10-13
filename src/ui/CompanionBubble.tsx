import { useCompanionBubble } from '@/game/companion/companionRuntime';
import { t } from '@/game/i18n';
import { useGameStore } from '@/game/state/gameStore';
import { useGameStateStore } from '@/game/state/gameStateStore';

/** 露米的對話泡泡：位置由 Companion（R3F）每幀寫入 transform，這裡只負責內容。 */
export function CompanionBubble() {
  const text = useCompanionBubble((s) => s.text);
  const id = useCompanionBubble((s) => s.id);
  const playing = useGameStore((s) => s.screen === 'playing');
  const unlocked = useGameStateStore((s) => s.state.companion.unlocked);
  return (
    <div id="companion-bubble" className="pointer-events-none absolute top-0 left-0" style={{ visibility: 'hidden' }}>
      {text && playing && unlocked && (
        <div key={id} data-testid="companion-bubble" className="animate-toast mb-2 max-w-72 rounded-2xl bg-white/95 px-4 py-2 text-sm leading-6 whitespace-pre-line text-amber-950 shadow-lg">
          <span className="mb-0.5 block text-xs font-bold text-amber-600">{t('companion.name')}</span>
          {text}
        </div>
      )}
    </div>
  );
}
