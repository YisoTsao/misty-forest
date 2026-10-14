import { useBossStore } from '@/game/combat/bossRuntime';
import { combat } from '@/game/authority';
import { t } from '@/game/i18n';
import { useGameStore } from '@/game/state/gameStore';

/**
 * 頭目血條（任務 8D）：名稱、血量、迷霧護盾（三個水槽，注水後點亮）；迷霧還在時提示要去引水。
 * 只在數值改變時重新渲染（useBossStore）。
 */
export function BossBar() {
  const hud = useBossStore((s) => s.hud);
  const playing = useGameStore((s) => s.screen === 'playing');
  if (!hud || !playing) return null;
  const name = t(combat.enemies.get(hud.bossId)?.nameKey ?? hud.bossId);
  const ratio = Math.max(0, hud.hp / hud.maxHp);
  const misty = hud.filled < hud.total;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center" data-testid="boss-bar" data-hp={hud.hp} data-filled={hud.filled} data-phase={hud.phase}>
      <div className="w-[min(560px,80vw)] text-center text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">
        <div className="mb-1 flex items-end justify-between gap-3 px-1">
          <p className="text-lg font-black tracking-[0.2em]">{name}</p>
          <div className="flex items-center gap-1.5" aria-label={t('boss.mist')}>
            {Array.from({ length: hud.total }, (_, i) => (
              <span
                key={i}
                data-testid="boss-trough"
                className={`inline-block h-3.5 w-3.5 rounded-full border-2 ${i < hud.filled ? 'border-sky-100 bg-sky-300 shadow-[0_0_8px_rgba(125,211,252,0.9)]' : 'border-violet-200/80 bg-violet-400/40'}`}
              />
            ))}
          </div>
        </div>
        <div className="h-3.5 overflow-hidden rounded-full border-2 border-white/80 bg-black/40">
          <div
            className={`h-full rounded-full transition-[width] duration-200 ${misty ? 'bg-gradient-to-r from-violet-400 to-violet-300' : hud.phase === 2 ? 'bg-gradient-to-r from-amber-500 to-orange-400' : 'bg-gradient-to-r from-emerald-500 to-lime-400'}`}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
        {misty && <p className="mt-1.5 text-sm font-bold tracking-wide text-sky-100">{t('boss.hint')}</p>}
      </div>
    </div>
  );
}
