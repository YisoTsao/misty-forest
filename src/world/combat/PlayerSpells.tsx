import { useFrame } from '@react-three/fiber';
import { isInBlast, pickSeekTarget, spreadYaws, steerYaw, type SpellDef } from '@/game-core/combat/spells';
import { assistFacing } from '@/game-core/combat/weapons';
import { terrainHeight } from '@/game-core/world/terrain';
import { audio } from '@/game/audio/audioEngine';
import { authority } from '@/game/authority';
import { currentSpells } from '@/game/character/currentClass';
import { attackEnemy, enemyHitRadius, combatRuntime, enemyRuntime } from '@/game/combat/combatRuntime';
import { cooldownOf, spellRuntime, type Projectile } from '@/game/combat/spellRuntime';
import { input } from '@/game/input/inputManager';
import { cameraRuntime, playerRuntime, queueNetAction } from '@/game/player/localRuntime';
import { currentScreen } from '@/game/state/gameStore';
import { useSettingsStore } from '@/game/state/settingsStore';
import { isModalOpen, useUiStore } from '@/game/state/uiStore';
import { projectileVisuals, vfx, type Rgb } from '@/game/vfx/vfxQueue';
import { launchMeteors, meteorCenter, updateMeteors } from './meteors';

/** 敵人身體半徑（命中判定用，與近戰相同） */
/** 彈體從手的高度發射、飛向敵人身體中心 */
const HAND_HEIGHT = 1.05;
const BODY_HEIGHT = 0.8;
/** 「星光不足」提示的最短間隔（秒） */
const NO_MP_TOAST_GAP = 1.2;

/**
 * 玩家的魔法（GAME_DESIGN 5.4）：Q / F / C 施放目前職業的三個法術（旅人：星光衝擊、星屑飛彈、流星雨；可重新配置）。
 * 施法：檢查星光值與冷卻 → 權威層扣除星光值 → 腳下魔法陣蓄力 → 發動。
 * - 範圍法術（nova）：發動瞬間以範圍判定命中，衝擊波 + 星點螺旋上升 + 地面光閃。
 * - 追蹤彈（bolt）：多枚星光彈飛向前方最近的敵人，本機模擬飛行，碰到敵人時送出攻擊指令。
 * - 流星雨（meteor）：蓄力時前方地面出現落點魔法陣；發動後流星依序斜落，每顆撞擊都以範圍判定，最後一顆範圍最大。
 * 命中仍由 game-core 判定（範圍與距離），特效只是表現。
 */
export function PlayerSpells() {
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const screen = currentScreen();
    if (screen === 'paused') return;
    for (const [id, cd] of spellRuntime.cooldowns) spellRuntime.cooldowns.set(id, Math.max(0, cd - dt));
    // 舊的 HUD 與測試讀取的技能冷卻 = 目前職業第一個法術（Q）的冷卻
    const owned = currentSpells();
    const skill = owned.find((s) => s.action === 'skill');
    combatRuntime.skillCooldown = skill ? cooldownOf(skill.id) : 0;

    const pressed = new Map<string, boolean>();
    for (const action of ['skill', 'spell2', 'spell3'] as const) {
      const down = input.consumePressed(action);
      const spell = owned.find((s) => s.action === action);
      if (spell) pressed.set(spell.id, down);
    }
    updateProjectiles(dt);
    updateMeteors(dt);
    if (useUiStore.getState().build || screen !== 'playing') {
      spellRuntime.casting = null;
      return;
    }
    const state = authority.getState();
    if (state.player.defeated) {
      spellRuntime.casting = null;
      return;
    }

    const casting = spellRuntime.casting;
    if (casting) {
      casting.elapsed += dt;
      if (!casting.released && casting.elapsed >= casting.spell.castTime) release(casting.spell);
      if (casting.elapsed >= casting.spell.duration) spellRuntime.casting = null;
      return;
    }

    if (isModalOpen() || playerRuntime.action || !playerRuntime.locomotion.grounded) return;
    for (const spell of owned) {
      if (!pressed.get(spell.id) || cooldownOf(spell.id) > 0) continue;
      if (state.player.mp < spell.mpCost) {
        notEnoughMp();
        continue;
      }
      begin(spell);
      break;
    }
  });

  return null;
}

function notEnoughMp(): void {
  const now = performance.now() / 1000;
  if (now - spellRuntime.noMpToastAt < NO_MP_TOAST_GAP) return;
  spellRuntime.noMpToastAt = now;
  useUiStore.getState().pushToast({ textKey: 'toast.noMp' });
  audio.play('ui_back');
}

/** 開始施法：權威層扣星光值，失敗時不施放 */
function begin(spell: SpellDef): void {
  // 權威層的介面不回傳結果（之後可換成遠端）：以星光值是否被扣除判斷施放成功
  const before = authority.getState().player.mp;
  authority.send({ type: 'CastSpell', spell: spell.id });
  if (authority.getState().player.mp >= before) {
    notEnoughMp();
    return;
  }
  spellRuntime.cooldowns.set(spell.id, spell.cooldown);
  spellRuntime.casting = { spell, elapsed: 0, released: false };
  const { position: at, locomotion: loco } = playerRuntime;
  if (spell.kind === 'meteor' && spell.meteor) {
    // 落點預警：前方地面先出現大魔法陣，流星全部落完才消失（Bible 11.2：攻擊必須有預兆）
    const target = meteorCenter(spell, { x: at.x, z: at.z, facingYaw: loco.facingYaw });
    spellRuntime.casting.target = target;
    const m = spell.meteor;
    vfx({
      type: 'magicCircle',
      x: target.x,
      y: terrainHeight(target.x, target.z),
      z: target.z,
      radius: spell.radius,
      duration: spell.castTime + m.count * m.interval + m.fallTime + 0.4,
      color: spell.color as Rgb,
    });
  }
  spellRuntime.casts++;
  const { position, locomotion } = playerRuntime;
  // 面向前方最近的敵人（範圍法術不需要）
  if (spell.kind === 'bolt' && spell.projectiles) {
    const targets = [...enemyRuntime.values()].filter((v) => v.vanishing === null).map((v) => ({ x: v.ai.x, z: v.ai.z }));
    const yaw = assistFacing({ x: position.x, z: position.z, facingYaw: locomotion.facingYaw }, targets, spell.projectiles.range, spell.projectiles.seekDeg, 0);
    if (yaw !== null) locomotion.facingYaw = yaw;
  }
  locomotion.vx = locomotion.vz = 0;
  playerRuntime.action = { clip: 'skill', clipName: spell.clips.cast, remaining: spell.duration };
  const target = spellRuntime.casting.target;
  queueNetAction({ kind: 'spell', t: performance.now(), spell: spell.id, phase: 'cast', yaw: locomotion.facingYaw, ...(target ? { tx: target.x, tz: target.z } : {}) });
  const feet = position.y - 0.76;
  vfx({
    type: 'magicCircle',
    x: position.x,
    y: feet,
    z: position.z,
    radius: spell.kind === 'nova' ? 1.7 : spell.kind === 'meteor' ? 1.3 : 1.1,
    duration: spell.duration + 0.25,
    color: spell.color as Rgb,
    follow: true,
  });
  audio.play('skill');
}

/** 發動：切換成發動動作，結算範圍法術或射出追蹤彈 */
function release(spell: SpellDef): void {
  const casting = spellRuntime.casting;
  if (casting) casting.released = true;
  const action = playerRuntime.action;
  if (action && action.clip === 'skill') action.clipName = spell.clips.release;
  const { position, locomotion } = playerRuntime;
  const feet = position.y - 0.76;
  const color = spell.color as Rgb;
  audio.sparkle();
  const target = casting?.target;
  queueNetAction({ kind: 'spell', t: performance.now(), spell: spell.id, phase: 'release', yaw: locomotion.facingYaw, ...(target ? { tx: target.x, tz: target.z } : {}) });

  if (spell.kind === 'nova') {
    for (const [id, v] of enemyRuntime) {
      if (v.vanishing !== null) continue;
      if (isInBlast(position, spell.radius, { x: v.ai.x, z: v.ai.z, radius: enemyHitRadius(v.kind) })) {
        attackEnemy(id, spell.id);
        spellRuntime.hits++;
      }
    }
    vfx({ type: 'shockwave', x: position.x, y: feet, z: position.z, radius: spell.radius + 0.6, duration: 0.6, color });
    vfx({ type: 'burst', preset: 'nova', x: position.x, y: feet, z: position.z, color, scale: spell.radius / 3.6 });
    vfx({ type: 'flash', x: position.x, y: feet + 1.4, z: position.z, color, intensity: 9, duration: 0.5, distance: spell.radius * 3 });
    if (useSettingsStore.getState().cameraShake) cameraRuntime.shake = Math.max(cameraRuntime.shake, 0.12);
    return;
  }

  if (spell.kind === 'meteor' && casting?.target) {
    launchMeteors(spell, casting.target);
    vfx({ type: 'flash', x: position.x, y: feet + 2, z: position.z, color, intensity: 5, duration: 0.4, distance: 8 });
    return;
  }

  if (spell.kind === 'bolt' && spell.projectiles) {
    const p = spell.projectiles;
    const targets = [...enemyRuntime.entries()].filter(([, v]) => v.vanishing === null).map(([id, v]) => ({ id, x: v.ai.x, z: v.ai.z }));
    const target = pickSeekTarget(position, locomotion.facingYaw, targets, p.seekDeg, p.range);
    const yaws = spreadYaws(locomotion.facingYaw, p.count, p.spreadDeg);
    yaws.forEach((yaw) => {
      spellRuntime.projectiles.push({
        id: spellRuntime.nextId++,
        spell,
        x: position.x + Math.sin(yaw) * 0.6,
        y: feet + HAND_HEIGHT,
        z: position.z + Math.cos(yaw) * 0.6,
        yaw,
        traveled: 0,
        target: target?.id ?? null,
      });
    });
    vfx({ type: 'flash', x: position.x, y: feet + 1.3, z: position.z, color, intensity: 4, duration: 0.25, distance: 6 });
  }
}

/**
 * 其他玩家施法（任務 11E）：在對方的位置畫出同樣的特效，不命中本機的敵人、不扣星光值、不震動鏡頭。
 * cast：腳下魔法陣（流星雨另外在落點畫預警魔法陣）；release：衝擊波、直飛的星光彈、流星。
 */
export function remoteSpell(spell: SpellDef, phase: 'cast' | 'release', feet: { x: number; y: number; z: number }, yaw: number, target?: { x: number; z: number }): void {
  const color = spell.color as Rgb;
  if (phase === 'cast') {
    const radius = spell.kind === 'nova' ? 1.7 : spell.kind === 'meteor' ? 1.3 : 1.1;
    vfx({ type: 'magicCircle', x: feet.x, y: feet.y, z: feet.z, radius, duration: spell.duration + 0.25, color });
    if (spell.kind === 'meteor' && spell.meteor && target) {
      const m = spell.meteor;
      vfx({
        type: 'magicCircle',
        x: target.x,
        y: terrainHeight(target.x, target.z),
        z: target.z,
        radius: spell.radius,
        duration: spell.castTime + m.count * m.interval + m.fallTime + 0.4,
        color,
      });
    }
    return;
  }
  if (spell.kind === 'nova') {
    vfx({ type: 'shockwave', x: feet.x, y: feet.y, z: feet.z, radius: spell.radius + 0.6, duration: 0.6, color });
    vfx({ type: 'burst', preset: 'nova', x: feet.x, y: feet.y, z: feet.z, color, scale: spell.radius / 3.6 });
    vfx({ type: 'flash', x: feet.x, y: feet.y + 1.4, z: feet.z, color, intensity: 9, duration: 0.5, distance: spell.radius * 3 });
    return;
  }
  if (spell.kind === 'meteor') {
    if (target) launchMeteors(spell, target, true);
    return;
  }
  if (spell.kind === 'bolt' && spell.projectiles) {
    const p = spell.projectiles;
    for (const y of spreadYaws(yaw, p.count, p.spreadDeg)) {
      spellRuntime.projectiles.push({
        id: spellRuntime.nextId++,
        spell,
        x: feet.x + Math.sin(y) * 0.6,
        y: feet.y + HAND_HEIGHT,
        z: feet.z + Math.cos(y) * 0.6,
        yaw: y,
        traveled: 0,
        target: null,
        visualOnly: true,
      });
    }
    vfx({ type: 'flash', x: feet.x, y: feet.y + 1.3, z: feet.z, color, intensity: 4, duration: 0.25, distance: 6 });
  }
}

/** 追蹤彈飛行：轉向目標、前進、碰到任何敵人就命中；超過射程消散 */
function updateProjectiles(dt: number): void {
  const list = spellRuntime.projectiles;
  for (let i = list.length - 1; i >= 0; i--) {
    const pr = list[i]!;
    const p = pr.spell.projectiles!;
    const target = pr.target ? enemyRuntime.get(pr.target) : undefined;
    const alive = target && target.vanishing === null ? target : undefined;
    if (alive) pr.yaw = steerYaw(pr.yaw, pr, { x: alive.ai.x, z: alive.ai.z }, p.turnRate, dt);
    const step = p.speed * dt;
    pr.x += Math.sin(pr.yaw) * step;
    pr.z += Math.cos(pr.yaw) * step;
    pr.traveled += step;
    // 高度：朝目標身體中心靠攏；沒有目標時保持在地面上方
    const ground = terrainHeight(pr.x, pr.z);
    const desiredY = (alive ? terrainHeight(alive.ai.x, alive.ai.z) : ground) + BODY_HEIGHT;
    pr.y += (desiredY - pr.y) * Math.min(1, dt * 6);
    pr.y = Math.max(pr.y, ground + 0.3);

    const hitId = pr.visualOnly ? null : hitEnemy(pr);
    if (hitId) {
      attackEnemy(hitId, pr.spell.id);
      spellRuntime.hits++;
      vfx({ type: 'burst', preset: 'boltHit', x: pr.x, y: pr.y, z: pr.z, color: pr.spell.color as Rgb });
      audio.play('hit');
      remove(i);
      continue;
    }
    if (pr.traveled >= p.range) {
      vfx({ type: 'burst', preset: 'boltHit', x: pr.x, y: pr.y, z: pr.z, color: pr.spell.color as Rgb, scale: 0.5 });
      remove(i);
      continue;
    }
    projectileVisuals.set(pr.id, { id: pr.id, x: pr.x, y: pr.y, z: pr.z, color: pr.spell.color as Rgb, size: 0.32, trail: 1 });
  }

  function remove(i: number): void {
    projectileVisuals.delete(list[i]!.id);
    list.splice(i, 1);
  }
}

function hitEnemy(pr: Projectile): string | null {
  for (const [id, v] of enemyRuntime) {
    if (v.vanishing !== null) continue;
    if (Math.hypot(v.ai.x - pr.x, v.ai.z - pr.z) <= pr.spell.radius + enemyHitRadius(v.kind)) return id;
  }
  return null;
}
