import { useEffect, useRef } from 'react';
import { PLAYER_STATS } from '@/game-core/combat/combat';
import { combatRuntime } from '@/game/combat/combatRuntime';
import { t } from '@/game/i18n';
import { actionKey } from '@/game/input/keyLabels';
import { useGameStore } from '@/game/state/gameStore';
import { useGameStateStore } from '@/game/state/gameStateStore';
import { useBindings } from '@/game/state/settingsStore';

/**
 * 戰鬥 HUD（規格 6.6）：左下血量、右下技能冷卻、受傷時畫面邊緣閃紅、倒下時的提示。
 * 冷卻與閃紅每幀變化，以 requestAnimationFrame 直接更新 DOM，不觸發 React 重新渲染。
 */
export function CombatHud() {
  const playing = useGameStore((s) => s.screen === 'playing');
  const hp = useGameStateStore((s) => s.state.player.hp);
  const defeated = useGameStateStore((s) => s.state.player.defeated);
  const bindings = useBindings();
  const cooldownRef = useRef<HTMLDivElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);
  const attackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const loop = () => {
      const skill = combatRuntime.skillCooldown / PLAYER_STATS.skill.cooldown;
      if (cooldownRef.current) cooldownRef.current.style.height = `${Math.max(0, skill) * 100}%`;
      const attack = combatRuntime.attackCooldown / PLAYER_STATS.attack.cooldown;
      if (attackRef.current) attackRef.current.style.height = `${Math.max(0, attack) * 100}%`;
      const v = vignetteRef.current;
      if (v) {
        // 全螢幕的 inset 陰影即使透明也會佔用合成，沒受傷時直接隱藏
        const flash = Math.min(1, combatRuntime.hurtFlash / 0.35);
        v.style.display = flash > 0 ? '' : 'none';
        v.style.opacity = String(flash);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  if (!playing) return null;
  const ratio = Math.max(0, hp / PLAYER_STATS.maxHp);
  return (
    <>
      <div ref={vignetteRef} className="pointer-events-none absolute inset-0" style={{ display: 'none', boxShadow: 'inset 0 0 160px 40px rgba(220, 40, 40, 0.55)' }} />
      <div className="pointer-events-none absolute bottom-6 left-6 w-60" data-testid="hp-bar" data-hp={Math.round(hp)}>
        <div className="mb-1 flex items-baseline gap-2 text-white drop-shadow">
          <span className="text-sm font-bold">{t('hud.hp')}</span>
          <span className="font-mono text-xs opacity-90">
            {Math.ceil(hp)} / {PLAYER_STATS.maxHp}
          </span>
        </div>
        <div className="h-3.5 overflow-hidden rounded-full border-2 border-white/70 bg-black/40">
          <div
            className={`h-full rounded-full transition-[width] duration-200 ${ratio > 0.3 ? 'bg-gradient-to-r from-emerald-400 to-lime-300' : 'bg-gradient-to-r from-rose-500 to-orange-400'}`}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
      </div>
      <div className="pointer-events-none absolute right-6 bottom-6 flex gap-3">
        <SkillSlot refEl={attackRef} keyLabel={actionKey(bindings, 'attack')} label={t('hud.attack')} icon="⚔" />
        <SkillSlot refEl={cooldownRef} keyLabel={actionKey(bindings, 'skill')} label={t('hud.skill')} icon="✦" testId="skill-slot" />
      </div>
      {defeated && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-indigo-950/55" data-testid="defeated">
          <div className="text-center text-white drop-shadow-lg">
            <p className="text-3xl font-black tracking-widest">{t('hud.defeated')}</p>
            <p className="mt-2 text-sm opacity-80">{t('hud.defeatedHint')}</p>
          </div>
        </div>
      )}
    </>
  );
}

function SkillSlot({ refEl, keyLabel, label, icon, testId }: { refEl: React.RefObject<HTMLDivElement | null>; keyLabel: string; label: string; icon: string; testId?: string }) {
  return (
    <div className="flex flex-col items-center gap-1" data-testid={testId}>
      <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border-2 border-amber-200/80 bg-black/45 text-2xl text-amber-200">
        <span>{icon}</span>
        {/* 冷卻遮罩：由上往下收 */}
        <div ref={refEl} className="absolute inset-x-0 bottom-0 bg-black/60" style={{ height: '0%' }} />
        <kbd className="absolute right-0.5 bottom-0.5 rounded bg-amber-200 px-1 text-[10px] font-bold text-amber-950">{keyLabel}</kbd>
      </div>
      <span className="text-[11px] text-white drop-shadow">{label}</span>
    </div>
  );
}
