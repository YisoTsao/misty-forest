import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { assistFacing, isInMoveArea, startHeavy, startLight, weaponIds, type MoveDef, type WeaponId } from '@/game-core/combat/weapons';
import { terrainHeight } from '@/game-core/world/terrain';
import { currentScreen } from '@/game/state/gameStore';
import { useSettingsStore } from '@/game/state/settingsStore';
import { isModalOpen, useUiStore } from '@/game/state/uiStore';
import { audio } from '@/game/audio/audioEngine';
import { authority, weapons } from '@/game/authority';
import { combatRuntime, enemyRuntime, pushImpact } from '@/game/combat/combatRuntime';
import { input } from '@/game/input/inputManager';
import { cameraRuntime, playerRuntime } from '@/game/player/localRuntime';

/** 倒下後多久重新站起來（秒） */
export const RESPAWN_DELAY = 3;
/** 倒下後回到的地點：晨曦村南邊路口（安全、離森林有段距離） */
const RESPAWN_POINT = { x: -8, z: -18 } as const;
/** 敵人身體半徑（命中判定用） */
const ENEMY_RADIUS = 0.5;
/** 先行輸入：動作結束前這段時間內按下的攻擊會排隊，動作一結束就出招（連段不會因為按早一點而斷掉） */
const BUFFER_SEC = 0.3;
/** 命中時的鏡頭震動（公尺，乘上招式的停頓長度換算） */
const SHAKE_PER_HITSTOP = 1.6;

type PendingHit = { move: MoveDef; weapon: WeaponId; delay: number };

/** 本幀被按下的武器切換（1 / 2 / 3 或依序切換）；沒有則為 null */
function pressedWeapon(current: WeaponId): WeaponId | null {
  let chosen: WeaponId | null = null;
  if (input.consumePressed('weapon1')) chosen = 'fist';
  if (input.consumePressed('weapon2')) chosen = 'knife';
  if (input.consumePressed('weapon3')) chosen = 'sword';
  if (input.consumePressed('cycleWeapon')) chosen = weaponIds[(weaponIds.indexOf(current) + 1) % weaponIds.length]!;
  return chosen;
}

/**
 * 玩家戰鬥（規格 6.6、GAME_DESIGN 5.3）：
 * - 左鍵輕擊連段、右鍵重擊；1 / 2 / 3 切換徒手（拳、踢）/ 短刀 / 單手劍（全部可重新配置）。魔法在 PlayerSpells。
 * - 出招時輕度鎖定前方最近的敵人；招式資料決定動畫、命中時間、範圍、往前衝與停頓。
 * - 揮下的瞬間以招式範圍判定命中的敵人，送出指令由權威層結算傷害；冷卻與連段在本機計算。
 * - 倒下後過一段時間重新站起來。
 */
export function PlayerCombat() {
  const pending = useMemo(() => [] as PendingHit[], []);
  const buffer = useMemo(() => ({ kind: null as 'light' | 'heavy' | null, until: 0 }), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const screen = currentScreen();
    if (screen === 'paused') return;
    const melee = combatRuntime.melee;
    melee.clock += dt;
    melee.hitStop = Math.max(0, melee.hitStop - dt);
    melee.heavyCooldown = Math.max(0, melee.heavyCooldown - dt);
    combatRuntime.attackCooldown = Math.max(0, combatRuntime.attackCooldown - dt);
    combatRuntime.invulnerable = Math.max(0, combatRuntime.invulnerable - dt);
    combatRuntime.hurtFlash = Math.max(0, combatRuntime.hurtFlash - dt);
    for (const n of combatRuntime.damageNumbers) n.age += dt;
    combatRuntime.damageNumbers = combatRuntime.damageNumbers.filter((n) => n.age < 1.1);
    for (const i of combatRuntime.impacts) i.age += dt;
    combatRuntime.impacts = combatRuntime.impacts.filter((i) => i.age < 0.6);

    // 每幀都讀掉按鍵，避免在選單或對話中按的鍵（數字鍵選選項）之後才生效
    const attackPressed = input.consumePressed('attack');
    const heavyPressed = input.consumePressed('heavyAttack');
    const state = authority.getState();
    const switchTo = pressedWeapon(state.player.weapon);
    // 建造模式中左鍵用來放置（BuildController），數字鍵選建造物
    if (useUiStore.getState().build) return;
    if (screen !== 'playing') {
      pending.length = 0;
      return;
    }

    // 倒下：一段時間後重新站起來，回到村子路口
    if (state.player.defeated) {
      pending.length = 0;
      combatRuntime.defeatedFor += dt;
      if (combatRuntime.defeatedFor >= RESPAWN_DELAY) {
        authority.send({ type: 'RespawnPlayer' });
        playerRuntime.teleportRequest = { ...RESPAWN_POINT };
      }
      return;
    }

    // 揮下的瞬間判定命中
    for (const hit of pending) hit.delay -= dt;
    for (const hit of pending.filter((h) => h.delay <= 0)) resolveHit(hit);
    for (let i = pending.length - 1; i >= 0; i--) if (pending[i]!.delay <= 0) pending.splice(i, 1);

    if (isModalOpen()) return;
    if (switchTo && switchTo !== state.player.weapon && !playerRuntime.action) {
      authority.send({ type: 'EquipWeapon', weapon: switchTo });
      audio.play('ui_click');
    }
    const busy = playerRuntime.action;
    if ((attackPressed || heavyPressed) && busy && busy.clip === 'attack' && busy.remaining <= BUFFER_SEC) {
      buffer.kind = heavyPressed ? 'heavy' : 'light';
      buffer.until = melee.clock + BUFFER_SEC;
    }
    if (busy || !playerRuntime.locomotion.grounded) return;
    const buffered = buffer.kind !== null && buffer.until >= melee.clock ? buffer.kind : null;
    buffer.kind = null;
    const lightWanted = attackPressed || buffered === 'light';
    const heavyWanted = heavyPressed || buffered === 'heavy';

    const weapon = weapons.weapons.get(authority.getState().player.weapon);
    if (weapon && heavyWanted) {
      const started = startHeavy(melee.combo, weapon, melee.clock);
      if (started) {
        melee.combo = started.combo;
        melee.heavyCooldown = melee.heavyCooldownTotal = started.move.cooldown;
        melee.comboCount = 0;
        perform(started.move, weapon.id);
      }
    } else if (weapon && lightWanted) {
      const started = startLight(melee.combo, weapon, melee.clock);
      melee.combo = started.combo;
      melee.comboCount = started.index + 1;
      melee.comboUntil = melee.clock + started.move.duration + weapon.comboWindow;
      perform(started.move, weapon.id);
    }

    function perform(move: MoveDef, weaponId: WeaponId): void {
      const { position, locomotion } = playerRuntime;
      const enemies = [...enemyRuntime.values()].filter((v) => v.vanishing === null).map((v) => ({ x: v.ai.x, z: v.ai.z }));
      const yaw = assistFacing({ x: position.x, z: position.z, facingYaw: locomotion.facingYaw }, enemies, move.range);
      if (yaw !== null) locomotion.facingYaw = yaw;
      locomotion.vx = locomotion.vz = 0;
      combatRuntime.attackCooldown = move.duration;
      combatRuntime.melee.lightTotal = move.duration;
      playerRuntime.action = {
        clip: 'attack',
        clipName: move.clip,
        speed: move.speed,
        remaining: move.duration,
        lunge: move.lunge,
        lungeTime: move.hitDelay,
      };
      pending.push({ move, weapon: weaponId, delay: move.hitDelay });
      audio.play('swing');
    }
  });

  return null;
}

/** 命中判定：範圍內的每個敵人送出攻擊指令；有命中時停頓、震動、顯示衝擊特效 */
function resolveHit(hit: PendingHit): void {
  const { position, locomotion } = playerRuntime;
  const self = { x: position.x, z: position.z, facingYaw: locomotion.facingYaw };
  let landed = false;
  for (const [id, v] of enemyRuntime) {
    if (v.vanishing !== null) continue;
    const target = { x: v.ai.x, z: v.ai.z, radius: ENEMY_RADIUS };
    if (!isInMoveArea(hit.move, self, target)) continue;
    // 切換武器後，前一把武器還沒揮下的招式不算
    if (authority.getState().player.weapon !== hit.weapon) continue;
    authority.send({ type: 'AttackEnemy', enemyId: id, attack: hit.move.id });
    landed = true;
    pushImpact({ x: v.ai.x, y: terrainHeight(v.ai.x, v.ai.z) + 0.9, z: v.ai.z, kind: hit.weapon === 'fist' ? 'dust' : 'spark', power: hit.move.damage / 20 });
  }
  if (landed) {
    combatRuntime.melee.hitStop = hit.move.hitStop;
    if (useSettingsStore.getState().cameraShake) cameraRuntime.shake = Math.max(cameraRuntime.shake, hit.move.hitStop * SHAKE_PER_HITSTOP);
  }
}
