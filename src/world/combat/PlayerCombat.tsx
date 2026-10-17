import { useFrame } from '@react-three/fiber';
import { chooseQuickHeal } from '@/game-core/items/consumables';
import { worldDataResult } from '@/game/worldData';
import { useMemo } from 'react';
import { assistFacing, isInMoveArea, startHeavy, startLight, type MoveDef, type WeaponId } from '@/game-core/combat/weapons';
import { mapAt } from '@/game-core/world/maps';
import { terrainHeight } from '@/game-core/world/terrain';
import { currentScreen } from '@/game/state/gameStore';
import { useSettingsStore } from '@/game/state/settingsStore';
import { isModalOpen, useUiStore } from '@/game/state/uiStore';
import { PLAYER_STATS } from '@/game-core/combat/combat';
import { audio } from '@/game/audio/audioEngine';
import { authority, weapons } from '@/game/authority';
import { currentWeapons } from '@/game/character/currentClass';
import { bossRetryPoint } from '@/game/combat/bossRuntime';
import { attackEnemy, enemyHitRadius, combatRuntime, enemyRuntime, pushImpact } from '@/game/combat/combatRuntime';
import { input } from '@/game/input/inputManager';
import { cameraRuntime, playerRuntime, queueNetAction } from '@/game/player/localRuntime';

/** 倒下後多久重新站起來（秒） */
export const RESPAWN_DELAY = 3;
/** 倒下後回到的地點：晨曦村南邊路口（安全、離森林有段距離） */
/** 敵人身體半徑（命中判定用） */
/** 先行輸入：動作結束前這段時間內按下的攻擊會排隊，動作一結束就出招（連段不會因為按早一點而斷掉） */
const BUFFER_SEC = 0.3;
/** 命中時的鏡頭震動（公尺，乘上招式的停頓長度換算） */
const SHAKE_PER_HITSTOP = 1.6;

type PendingHit = { move: MoveDef; weapon: WeaponId; delay: number };

/** 本幀被按下的武器切換（1 / 2 / 3 或依序切換）；沒有則為 null */
/** 「武器 1–3」對應目前職業的第 1–3 把武器（職業沒有的欄位不動作） */
function pressedWeapon(current: WeaponId): WeaponId | null {
  const owned = currentWeapons();
  let chosen: WeaponId | null = null;
  (['weapon1', 'weapon2', 'weapon3'] as const).forEach((action, i) => {
    if (input.consumePressed(action) && owned[i]) chosen = owned[i];
  });
  if (input.consumePressed('cycleWeapon')) chosen = owned[(owned.indexOf(current) + 1) % owned.length] ?? null;
  return chosen;
}

/**
 * 玩家戰鬥（規格 6.6、GAME_DESIGN 5.3）：
 * - 左鍵輕擊連段、右鍵重擊；1 / 2 / 3 切換目前職業的武器（旅人：徒手 / 短刀 / 單手劍；全部可重新配置）。魔法在 PlayerSpells。
 * - 出招時輕度鎖定前方最近的敵人；招式資料決定動畫、命中時間、範圍、往前衝與停頓。
 * - 揮下的瞬間以招式範圍判定命中的敵人，送出指令由權威層結算傷害；冷卻與連段在本機計算。
 * - 倒下後過一段時間重新站起來。
 */
/** 快速使用回復藥（任務 7I）：依體力與是否被緩速選藥，沒有可用的藥時提示 */
function quickHeal(): void {
  const state = authority.getState();
  if (state.player.defeated) return;
  const itemId = chooseQuickHeal(state.inventory, itemCatalog, { hp: state.player.hp, maxHp: PLAYER_STATS.maxHp, slowed: combatRuntime.slow.remaining > 0 });
  if (itemId) authority.send({ type: 'UseItem', itemId });
  else useUiStore.getState().pushToast({ textKey: state.player.hp >= PLAYER_STATS.maxHp ? 'toast.hpFull' : 'toast.noHeal' });
}

const itemCatalog = worldDataResult.ok ? worldDataResult.data.items : new Map();

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
    const healPressed = input.consumePressed('quickHeal');
    const state = authority.getState();
    const switchTo = pressedWeapon(state.player.weapon);
    // 建造模式中左鍵用來放置（BuildController），數字鍵選建造物
    if (useUiStore.getState().build) return;
    if (screen !== 'playing') {
      pending.length = 0;
      return;
    }
    if (healPressed && !isModalOpen()) quickHeal();

    // 倒下：一段時間後重新站起來，回到重生點
    if (state.player.defeated) {
      pending.length = 0;
      combatRuntime.defeatedFor += dt;
      if (combatRuntime.defeatedFor >= RESPAWN_DELAY) {
        authority.send({ type: 'RespawnPlayer' });
        // 回到所在地圖的重生點（晨曦谷地為村子路口、螢苔祕林為林緣小徑入口）；在頭目戰場倒下時回到戰場入口外（任務 8D）
        const { x, z } = playerRuntime.position;
        const respawn = bossRetryPoint(x, z) ?? mapAt(x, z).respawn;
        playerRuntime.teleportRequest = { x: respawn.x, z: respawn.z };
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
      queueNetAction({ kind: 'melee', t: performance.now(), move: move.id });
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
    const target = { x: v.ai.x, z: v.ai.z, radius: enemyHitRadius(v.kind) };
    if (!isInMoveArea(hit.move, self, target)) continue;
    // 切換武器後，前一把武器還沒揮下的招式不算
    if (authority.getState().player.weapon !== hit.weapon) continue;
    attackEnemy(id, hit.move.id);
    landed = true;
    pushImpact({ x: v.ai.x, y: terrainHeight(v.ai.x, v.ai.z) + 0.9, z: v.ai.z, kind: hit.weapon === 'fist' ? 'dust' : 'spark', power: hit.move.damage / 20 });
  }
  if (landed) {
    combatRuntime.melee.hitStop = hit.move.hitStop;
    if (useSettingsStore.getState().cameraShake) cameraRuntime.shake = Math.max(cameraRuntime.shake, hit.move.hitStop * SHAKE_PER_HITSTOP);
  }
}
