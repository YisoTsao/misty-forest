import { worldDataResult } from '@/game/worldData';
import { countItem } from '@/game-core/inventory/inventory';
import { useEffect, useMemo, useRef } from 'react';
import { PLAYER_STATS } from '@/game-core/combat/combat';
import { nearCampfire } from '@/game-core/authority/rules';
import { authority } from '@/game/authority';
import { combatRuntime } from '@/game/combat/combatRuntime';
import { playerRuntime } from '@/game/player/localRuntime';
import { t } from '@/game/i18n';
import { actionKey } from '@/game/input/keyLabels';
import { useGameStore } from '@/game/state/gameStore';
import { useGameStateStore } from '@/game/state/gameStateStore';
import { useBindings } from '@/game/state/settingsStore';
import { weapons } from '@/game/authority';
import { heroClassDef, spellsOf, weaponsOf } from '@/game/character/currentClass';
import { cooldownOf } from '@/game/combat/spellRuntime';
import { MAX_MP } from '@/game-core/combat/spells';

import type { WeaponId } from '@/game-core/combat/weapons';
import { timeRuntime } from '@/game/world/timeRuntime';
import { formatClock } from '@/game-core/world/timeOfDay';

/**
 * 戰鬥 HUD（規格 6.6）：左下血量、右下技能冷卻、受傷時畫面邊緣閃紅、倒下時的提示。
 * 冷卻與閃紅每幀變化，以 requestAnimationFrame 直接更新 DOM，不觸發 React 重新渲染。
 */
export function CombatHud() {
  const playing = useGameStore((s) => s.screen === 'playing');
  const hp = useGameStateStore((s) => s.state.player.hp);
  const defeated = useGameStateStore((s) => s.state.player.defeated);
  const bindings = useBindings();
  const spellRefs = useRef(new Map<string, HTMLDivElement | null>());
  const mpRef = useRef<HTMLDivElement>(null);
  const mpTextRef = useRef<HTMLSpanElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);
  const cozyRef = useRef<HTMLDivElement>(null);
  const attackRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const heavyRef = useRef<HTMLDivElement>(null);
  const comboRef = useRef<HTMLDivElement>(null);
  const weaponId = useGameStateStore((s) => s.state.player.weapon);
  const weapon = weapons.weapons.get(weaponId);
  // 職業（使用者 2026-10-17）：右下的法術欄與武器欄依職業而不同
  const heroClass = useGameStateStore((s) => s.state.player.heroClass);
  const spellList = useMemo(() => spellsOf(heroClass), [heroClass]);
  const classDef = heroClassDef(heroClass);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const loop = () => {
      // 魔法（GAME_DESIGN 5.4）：每個法術的冷卻與星光值條
      for (const spell of spellList) {
        const el = spellRefs.current.get(spell.id);
        if (el) el.style.height = `${Math.max(0, cooldownOf(spell.id) / spell.cooldown) * 100}%`;
      }
      const mp = authority.getState().player.mp;
      if (mpRef.current) mpRef.current.style.width = `${(mp / MAX_MP) * 100}%`;
      if (mpTextRef.current) {
        const text = `${Math.floor(mp)} / ${MAX_MP}`;
        if (mpTextRef.current.textContent !== text) mpTextRef.current.textContent = text;
      }
      const melee = combatRuntime.melee;
      const attack = combatRuntime.attackCooldown / melee.lightTotal;
      if (attackRef.current) attackRef.current.style.height = `${Math.max(0, attack) * 100}%`;
      if (heavyRef.current) heavyRef.current.style.height = `${Math.max(0, melee.heavyCooldown / melee.heavyCooldownTotal) * 100}%`;
      const combo = comboRef.current;
      if (combo) {
        const show = melee.comboCount > 1 && melee.clock <= melee.comboUntil;
        const text = show ? t('hud.combo', { count: melee.comboCount }) : '';
        if (combo.textContent !== text) combo.textContent = text;
      }
      const v = vignetteRef.current;
      if (v) {
        // 全螢幕的 inset 陰影即使透明也會佔用合成，沒受傷時直接隱藏
        const flash = Math.min(1, combatRuntime.hurtFlash / 0.35);
        v.style.display = flash > 0 ? '' : 'none';
        v.style.opacity = String(flash);
      }
      const clock = clockRef.current;
      if (clock) {
        const text = t('hud.clock', {
          icon: timeRuntime.moonLight ? '🌙' : '☀',
          day: timeRuntime.day + 1,
          time: formatClock(timeRuntime.hour),
        });
        if (clock.textContent !== text) clock.textContent = text;
      }
      if (cozyRef.current) cozyRef.current.style.display = nearCampfire(authority.getState(), playerRuntime.position) ? '' : 'none';
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, spellList]);

  if (!playing) return null;
  const ratio = Math.max(0, hp / PLAYER_STATS.maxHp);
  return (
    <>
      <div ref={vignetteRef} className="pointer-events-none absolute inset-0" style={{ display: 'none', boxShadow: 'inset 0 0 160px 40px rgba(220, 40, 40, 0.55)' }} />
      <div className="pointer-events-none absolute bottom-6 left-6 w-60" data-testid="hp-bar" data-hp={Math.round(hp)}>
        <div ref={cozyRef} data-testid="cozy" className="mb-1.5 w-fit rounded-full bg-orange-400/85 px-3 py-0.5 text-xs font-bold text-white shadow" style={{ display: 'none' }}>
          🔥 {t('hud.cozy')}
        </div>
        {classDef && (
          <div data-testid="hud-class" data-class={classDef.id} className="mb-0.5 text-xs font-bold whitespace-nowrap text-amber-100 drop-shadow">
            {classDef.icon} {t('hud.class', { role: t(classDef.roleKey), name: t(classDef.nameKey) })}
          </div>
        )}
        <div className="mb-1 flex items-baseline gap-2 text-white drop-shadow">
          <span className="text-sm font-bold">{t('hud.hp')}</span>
          <span className="font-mono text-xs opacity-90">
            {Math.ceil(hp)} / {PLAYER_STATS.maxHp}
          </span>
          {/* 日夜（GAME_DESIGN 5.2）：第幾天與時鐘，每幀由 rAF 直接更新文字 */}
          <span ref={clockRef} data-testid="hud-clock" className="ml-auto font-mono text-xs opacity-90" />
        </div>
        <div className="h-3.5 overflow-hidden rounded-full border-2 border-white/70 bg-black/40">
          <div
            className={`h-full rounded-full transition-[width] duration-200 ${ratio > 0.3 ? 'bg-gradient-to-r from-emerald-400 to-lime-300' : 'bg-gradient-to-r from-rose-500 to-orange-400'}`}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
        {/* 星光值（MP）：金色細條，每幀由 rAF 更新 */}
        <div className="mt-1.5 flex items-center gap-2 text-white drop-shadow" data-testid="mp-bar">
          <span className="text-xs font-bold text-amber-200">{t('hud.mp')}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full border border-amber-100/70 bg-black/40">
            <div ref={mpRef} className="h-full rounded-full bg-gradient-to-r from-amber-300 to-yellow-100 shadow-[0_0_8px_rgba(255,215,122,0.9)]" style={{ width: '100%' }} />
          </div>
          <span ref={mpTextRef} className="w-14 text-right font-mono text-[10px] opacity-90" />
        </div>
        <PotionCount keyLabel={actionKey(bindings, 'quickHeal')} />
      </div>
      <div className="pointer-events-none absolute right-6 bottom-6 flex gap-3">
        <div className="flex flex-col items-end gap-2">
          <div ref={comboRef} data-testid="combo" className="h-6 text-lg font-black tracking-wider text-amber-200 italic drop-shadow" />
          <WeaponSelector current={weaponId} owned={weaponsOf(heroClass)} />
          <div className="flex gap-3">
            <SkillSlot refEl={attackRef} keyLabel={actionKey(bindings, 'attack')} label={t(weapon?.nameKey ?? 'hud.attack')} icon={weapon?.icon ?? '⚔'} testId="attack-slot" />
            <SkillSlot refEl={heavyRef} keyLabel={actionKey(bindings, 'heavyAttack')} label={t('hud.heavy')} icon="💥" testId="heavy-slot" />
            {spellList.map((spell) => (
              <SkillSlot
                key={spell.id}
                refEl={(el) => void spellRefs.current.set(spell.id, el)}
                keyLabel={actionKey(bindings, spell.action)}
                label={t(spell.nameKey)}
                icon={spell.icon}
                testId={spell.action === 'skill' ? 'skill-slot' : `spell-slot-${spell.id}`}
              />
            ))}
          </div>
        </div>
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

const WEAPON_ACTIONS = ['weapon1', 'weapon2', 'weapon3'] as const;

/** 目前職業的武器（GAME_DESIGN 5.3，最多三把）：目前裝備的亮起，旁邊標示切換按鍵 */
function WeaponSelector({ current, owned }: { current: WeaponId; owned: readonly WeaponId[] }) {
  const bindings = useBindings();
  return (
    <div className="flex gap-1.5" data-testid="weapon-selector" data-weapon={current}>
      {owned.map((id, i) => {
        const w = weapons.weapons.get(id);
        const active = id === current;
        return (
          <div
            key={id}
            title={t(w?.nameKey ?? id)}
            className={`relative flex h-9 w-9 items-center justify-center rounded-xl border-2 text-lg transition ${active ? 'scale-110 border-amber-300 bg-amber-400/35' : 'border-white/35 bg-black/40 opacity-70'}`}
          >
            {w?.icon}
            <kbd className="absolute -right-1 -bottom-1 rounded bg-white/85 px-0.5 text-[9px] font-bold text-slate-800">{actionKey(bindings, WEAPON_ACTIONS[i] ?? 'weapon1')}</kbd>
          </div>
        );
      })}
    </div>
  );
}

function SkillSlot({ refEl, keyLabel, label, icon, testId }: { refEl: React.Ref<HTMLDivElement>; keyLabel: string; label: string; icon: string; testId?: string }) {
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

/** 身上的回復藥總數與快速使用鍵（任務 7I）；沒有藥時不顯示 */
function PotionCount({ keyLabel }: { keyLabel: string }) {
  const inventory = useGameStateStore((s) => s.state.inventory);
  const items = worldDataResult.ok ? worldDataResult.data.items : null;
  const count = items ? [...items.values()].filter((d) => d.use).reduce((n, d) => n + countItem(inventory, d.id), 0) : 0;
  if (count === 0) return null;
  return (
    <div className="mt-1.5 flex w-fit items-center gap-1.5 rounded-full bg-black/40 px-2 py-0.5 text-xs text-white" data-testid="potion-count">
      <span className="rounded bg-white/85 px-1 font-mono text-[10px] font-bold text-amber-950">{keyLabel}</span>
      <span>🧪 {t('hud.potions')} ×{count}</span>
    </div>
  );
}
