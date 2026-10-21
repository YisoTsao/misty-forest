// 手機版的觸控操作（使用者 2026-10-20：「要支援手機版遊玩，用虛擬搖桿，要支援橫向跟直向」）。
// 只在觸控裝置（或網址 ?touch=1）遊玩中顯示，分成兩層：
// - TouchSurface：放在 3D 畫面正上方、其他 HUD 底下。左半邊按下就是浮動搖桿的中心，右半邊拖曳轉視角、雙指縮放。
// - TouchButtons：放在 HUD 上層。右下以攻擊鈕為圓心排成兩圈弧形（依螢幕大小縮放，直向、橫向都放得下），右上一排選單鈕。
// 按鈕與手把一樣算一次「按下」（input.touchTap），冷卻遮罩與 CombatHud 讀同一份資料。
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ActionId } from '@/game-core/input/actions';
import { JOYSTICK_RADIUS, joystickKnob, joystickMove, pinchZoom, touchLook } from '@/game-core/input/touch';
import { spellsOf } from '@/game/character/currentClass';
import { combatRuntime } from '@/game/combat/combatRuntime';
import { cooldownOf } from '@/game/combat/spellRuntime';
import { weapons } from '@/game/authority';
import { t } from '@/game/i18n';
import { swallowNextClick, useTouchUi } from '@/game/input/device';
import { input } from '@/game/input/inputManager';
import { useGameStore } from '@/game/state/gameStore';
import { useGameStateStore } from '@/game/state/gameStateStore';
import { useUiStore } from '@/game/state/uiStore';
import { ActionIcon, type ActionIconId } from './ActionIcon';
import { SkillIcon } from './SkillIcon';
import { CLASS_TONES, spellIconOf } from './spellIcons';

/** 視窗（對話、背包、地圖…）開著時不能移動，觸控操作收起來 */
function useModal(): boolean {
  return useUiStore(
    (s) =>
      s.dialogue !== null ||
      s.inventoryOpen ||
      s.mapOpen ||
      s.journalOpen ||
      s.shop !== null ||
      s.craft !== null ||
      s.message !== null ||
      s.build !== null ||
      s.settingsOpen ||
      s.multiplayerOpen ||
      s.chatOpen,
  );
}

/** 左邊多少比例的畫面是搖桿區（其餘是視角區） */
const JOYSTICK_ZONE = 0.45;

export function TouchSurface() {
  const touch = useTouchUi();
  const playing = useGameStore((s) => s.screen === 'playing');
  const modal = useModal();
  // 收起來（打開視窗、離開遊玩）時整個卸載：狀態清空，卸載時放開搖桿
  return touch && playing && !modal ? <ActiveSurface /> : null;
}

function ActiveSurface() {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState<{ x: number; y: number } | null>(null);
  const state = useRef({
    stick: null as { id: number; x: number; y: number } | null,
    look: new Map<number, { x: number; y: number }>(),
    pinch: { distance: 0, carry: 0 },
  });

  // 卸載時放開搖桿，角色不會一直走
  useEffect(() => () => input.setTouchMove(null), []);

  const pinchDistance = () => {
    const [a, b] = [...state.current.look.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // 阻止瀏覽器的捲動、縮放與點擊後補送的滑鼠事件（否則會被當成滑鼠左鍵攻擊）
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const s = state.current;
    if (e.clientX < window.innerWidth * JOYSTICK_ZONE && !s.stick) {
      s.stick = { id: e.pointerId, x: e.clientX, y: e.clientY };
      setStick({ x: e.clientX, y: e.clientY });
      return;
    }
    s.look.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (s.look.size === 2) s.pinch = { distance: pinchDistance(), carry: 0 };
  };

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = state.current;
    if (s.stick?.id === e.pointerId) {
      const dx = e.clientX - s.stick.x;
      const dy = e.clientY - s.stick.y;
      input.setTouchMove(joystickMove(dx, dy));
      const knob = joystickKnob(dx, dy);
      if (knobRef.current) knobRef.current.style.transform = `translate(${knob.x}px, ${knob.y}px)`;
      return;
    }
    const last = s.look.get(e.pointerId);
    if (!last) return;
    if (s.look.size >= 2) {
      s.look.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const distance = pinchDistance();
      const zoom = pinchZoom(s.pinch.distance, distance, s.pinch.carry);
      if (zoom.steps !== 0) input.addTouchZoom(zoom.steps);
      s.pinch = { distance, carry: zoom.carry };
      return;
    }
    const look = touchLook(e.clientX - last.x, e.clientY - last.y);
    input.addTouchLook(look.dx, look.dy);
    s.look.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };

  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = state.current;
    if (s.stick?.id === e.pointerId) {
      s.stick = null;
      input.setTouchMove(null);
      setStick(null);
      return;
    }
    s.look.delete(e.pointerId);
  };

  const at = stick ?? null;
  return (
    <div
      data-testid="touch-surface"
      className="absolute inset-0"
      style={{ touchAction: 'none' }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 搖桿：按著的時候畫在手指按下的位置；沒按的時候在左下角淡淡地提示位置 */}
      <div
        ref={baseRef}
        data-testid="touch-joystick"
        className={`pointer-events-none absolute rounded-full border-2 border-white/50 bg-black/20 ${at ? '' : 'opacity-40'}`}
        style={
          at
            ? { width: JOYSTICK_RADIUS * 2, height: JOYSTICK_RADIUS * 2, left: at.x - JOYSTICK_RADIUS, top: at.y - JOYSTICK_RADIUS }
            : { width: JOYSTICK_RADIUS * 2, height: JOYSTICK_RADIUS * 2, left: 'max(1.25rem, env(safe-area-inset-left))', bottom: '1.75rem' }
        }
      >
        <div
          ref={knobRef}
          className="absolute rounded-full border-2 border-white/80 bg-white/45 shadow"
          style={{ width: 52, height: 52, left: JOYSTICK_RADIUS - 26, top: JOYSTICK_RADIUS - 26, transform: 'translate(0px, 0px)' }}
        />
      </div>
    </div>
  );
}

type Slot = { action: ActionId; icon: ReactNode; label: string; size: number; ring: number; angle: number; cooldown?: () => number; testId: string; highlight?: boolean };

/** 攻擊鈕的中心離右下角的距離（px，縮放前） */
const ANCHOR = { right: 64, bottom: 66 };

export function TouchButtons() {
  const touch = useTouchUi();
  const playing = useGameStore((s) => s.screen === 'playing');
  const modal = useModal();
  const defeated = useGameStateStore((s) => s.state.player.defeated);
  const heroClass = useGameStateStore((s) => s.state.player.heroClass);
  const weaponId = useGameStateStore((s) => s.state.player.weapon);
  const interactTarget = useUiStore((s) => s.interactTarget);
  const spells = useMemo(() => spellsOf(heroClass), [heroClass]);
  const weapon = weapons.weapons.get(weaponId);
  const overlays = useRef(new Map<string, HTMLDivElement | null>());
  const [scale, setScale] = useState(() => clusterScale());

  useEffect(() => {
    const onResize = () => setScale(clusterScale());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  const slots: Slot[] = useMemo(
    () => [
      { action: 'attack', icon: <ActionIcon id={weaponId} className="h-[62%] w-[62%]" />, label: t(weapon?.nameKey ?? 'hud.attack'), size: 80, ring: 0, angle: 0, cooldown: () => combatRuntime.attackCooldown / combatRuntime.melee.lightTotal, testId: 'touch-attack' },
      { action: 'heavyAttack', icon: <ActionIcon id="heavy" className="h-[62%] w-[62%]" />, label: t('hud.heavy'), size: 58, ring: 98, angle: 180, cooldown: () => combatRuntime.melee.heavyCooldown / combatRuntime.melee.heavyCooldownTotal, testId: 'touch-heavy' },
      { action: 'interact', icon: <ActionIcon id="interact" className="h-[62%] w-[62%]" />, label: t('touch.interact'), size: 58, ring: 98, angle: 136, testId: 'touch-interact' },
      { action: 'jump', icon: <ActionIcon id="jump" className="h-[62%] w-[62%]" />, label: t('touch.jump'), size: 58, ring: 98, angle: 92, testId: 'touch-jump' },
      ...spells.map(
        (spell, i): Slot => ({
          action: spell.action,
          icon: <SkillIcon id={spellIconOf(spell.id)} tone={CLASS_TONES[heroClass]} className="h-full w-full" />,
          label: t(spell.nameKey),
          size: 50,
          ring: 166,
          angle: [108, 131, 154][i] ?? 154,
          cooldown: () => cooldownOf(spell.id) / spell.cooldown,
          testId: `touch-${spell.action}`,
        }),
      ),
      { action: 'cycleWeapon', icon: <ActionIcon id="cycle" className="h-[62%] w-[62%]" />, label: t('touch.weapon'), size: 44, ring: 166, angle: 86, testId: 'touch-weapon' },
      { action: 'quickHeal', icon: <ActionIcon id="heal" className="h-[62%] w-[62%]" />, label: t('touch.heal'), size: 44, ring: 166, angle: 177, testId: 'touch-heal' },
    ],
    [spells, weapon, weaponId, heroClass],
  );

  // 冷卻遮罩每幀更新 DOM（與 CombatHud 相同的做法，不觸發 React 重新渲染）
  useEffect(() => {
    if (!touch || !playing) return;
    let raf = 0;
    const loop = () => {
      for (const slot of slots) {
        const el = overlays.current.get(slot.testId);
        if (el && slot.cooldown) el.style.height = `${Math.min(1, Math.max(0, slot.cooldown())) * 100}%`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [touch, playing, slots]);

  if (!touch || !playing) return null;
  return (
    <>
      {/* 選單鈕（暫停、背包、地圖、任務、芽芽、聊天）：直向排成一欄放在小地圖下面；橫向畫面矮，排成一列放在小地圖左邊，不碰到右下的按鈕。
          位置用 px：小地圖是固定像素大小，不隨觸控介面縮小的字級（styles.css 的 html.touch-ui）變動 */}
      <div data-testid="touch-menu" className="absolute flex gap-1.5 portrait:top-[152px] portrait:right-3 portrait:flex-col landscape:top-3 landscape:right-[140px] landscape:flex-row">
        <MenuButton testId="touch-pause" icon="pause" label={t('touch.pause')} onPress={() => input.touchKey('Escape')} />
        {!modal && (
          <>
            <MenuButton testId="touch-inventory" icon="inventory" label={t('touch.inventory')} onPress={() => input.touchTap('inventory')} />
            <MenuButton testId="touch-map" icon="map" label={t('touch.map')} onPress={() => input.touchTap('map')} />
            <MenuButton testId="touch-journal" icon="journal" label={t('touch.journal')} onPress={() => input.touchTap('journal')} />
            <MenuButton testId="touch-companion" icon="companion" label={t('touch.companion')} onPress={() => input.touchTap('companion')} />
            <MenuButton testId="touch-chat" icon="chat" label={t('touch.chat')} onPress={() => input.touchKey('Enter')} />
          </>
        )}
      </div>
      {!modal && !defeated && (
        <div
          data-testid="touch-buttons"
          className="absolute"
          style={{
            right: `max(0px, env(safe-area-inset-right))`,
            bottom: `max(0px, env(safe-area-inset-bottom))`,
            width: 0,
            height: 0,
            transform: `scale(${scale})`,
            transformOrigin: 'bottom right',
          }}
        >
          {slots.map((slot) => {
            const rad = (slot.angle * Math.PI) / 180;
            // 以攻擊鈕的中心為圓心：0° 在右邊、90° 在正上方、180° 在左邊
            const cx = ANCHOR.right - Math.cos(rad) * slot.ring;
            const cy = ANCHOR.bottom + Math.sin(rad) * slot.ring;
            const lit = slot.action === 'interact' && interactTarget !== null;
            return (
              <button
                key={slot.testId}
                type="button"
                data-testid={slot.testId}
                aria-label={slot.label}
                className={`absolute flex items-center justify-center overflow-hidden rounded-full border-2 text-white shadow-lg select-none active:scale-95 ${
                  lit ? 'border-amber-200 bg-amber-400/70' : 'border-white/60 bg-black/40'
                }`}
                style={{ width: slot.size, height: slot.size, right: cx - slot.size / 2, bottom: cy - slot.size / 2, fontSize: slot.size * 0.42, touchAction: 'none' }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  swallowNextClick();
                  input.touchTap(slot.action);
                }}
                onContextMenu={(e) => e.preventDefault()}
              >
                <span className="pointer-events-none flex h-full w-full items-center justify-center">{slot.icon}</span>
                {slot.cooldown && <div ref={(el) => void overlays.current.set(slot.testId, el)} className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/60" style={{ height: '0%' }} />}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function MenuButton({ testId, icon, label, onPress }: { testId: string; icon: ActionIconId; label: string; onPress: () => void }) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/50 bg-black/40 text-lg text-white shadow select-none active:scale-95"
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        swallowNextClick();
        onPress();
      }}
    >
      <ActionIcon id={icon} className="pointer-events-none h-6 w-6" />
    </button>
  );
}

/** 按鈕群的縮放：以螢幕較短的一邊決定（直向的寬、橫向的高），太小的手機縮小，平板不放大 */
function clusterScale(): number {
  if (typeof window === 'undefined') return 1;
  const short = Math.min(window.innerWidth, window.innerHeight);
  return Math.min(1, Math.max(0.7, short / 430));
}
