import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { isInAttackArea, PLAYER_STATS } from '@/game-core/combat/combat';
import { currentScreen } from '@/game/state/gameStore';
import { isModalOpen, useUiStore } from '@/game/state/uiStore';
import { audio } from '@/game/audio/audioEngine';
import { authority } from '@/game/authority';
import { combatRuntime, enemyRuntime } from '@/game/combat/combatRuntime';
import { input } from '@/game/input/inputManager';
import { playerRuntime } from '@/game/player/localRuntime';

/** 倒下後多久重新站起來（秒） */
export const RESPAWN_DELAY = 3;
/** 倒下後回到的地點：星光村南邊路口（安全、離森林有段距離） */
const RESPAWN_POINT = { x: -8, z: -18 } as const;
const ACTION_SEC = { attack: 0.6, skill: 0.85 } as const;
/** 敵人身體半徑（命中判定用） */
const ENEMY_RADIUS = 0.5;

type PendingHit = { kind: 'attack' | 'skill'; delay: number };

/**
 * 玩家戰鬥（規格 6.6）：左鍵攻擊、Q 技能（可重新配置）。按下時播放動作，揮下的瞬間以 isInAttackArea 判定
 * 命中的敵人，送出指令由權威層結算傷害；冷卻在本機計算。倒下後過一段時間重新站起來。
 */
export function PlayerCombat() {
  const pending = useMemo(() => [] as PendingHit[], []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const screen = currentScreen();
    if (screen === 'paused') return;
    combatRuntime.attackCooldown = Math.max(0, combatRuntime.attackCooldown - dt);
    combatRuntime.skillCooldown = Math.max(0, combatRuntime.skillCooldown - dt);
    combatRuntime.invulnerable = Math.max(0, combatRuntime.invulnerable - dt);
    combatRuntime.hurtFlash = Math.max(0, combatRuntime.hurtFlash - dt);
    for (const n of combatRuntime.damageNumbers) n.age += dt;
    combatRuntime.damageNumbers = combatRuntime.damageNumbers.filter((n) => n.age < 1.1);
    if (combatRuntime.skillFx) {
      combatRuntime.skillFx.age += dt;
      if (combatRuntime.skillFx.age > 0.7) combatRuntime.skillFx = null;
    }

    // 建造模式中左鍵用來放置（BuildController）
    if (useUiStore.getState().build) return;
    const attackPressed = input.consumePressed('attack');
    const skillPressed = input.consumePressed('skill');
    if (screen !== 'playing') {
      pending.length = 0;
      return;
    }

    // 倒下：一段時間後重新站起來，回到村子路口
    if (authority.getState().player.defeated) {
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
    for (const hit of pending.filter((h) => h.delay <= 0)) {
      const { position, locomotion } = playerRuntime;
      const self = { x: position.x, z: position.z, facingYaw: locomotion.facingYaw };
      for (const [id, v] of enemyRuntime) {
        if (v.vanishing !== null) continue;
        if (isInAttackArea(hit.kind, self, { x: v.ai.x, z: v.ai.z, radius: ENEMY_RADIUS })) {
          authority.send({ type: 'AttackEnemy', enemyId: id, attack: hit.kind });
        }
      }
    }
    for (let i = pending.length - 1; i >= 0; i--) if (pending[i]!.delay <= 0) pending.splice(i, 1);

    if (isModalOpen() || playerRuntime.action || !playerRuntime.locomotion.grounded) return;
    if (skillPressed && combatRuntime.skillCooldown <= 0) {
      combatRuntime.skillCooldown = PLAYER_STATS.skill.cooldown;
      playerRuntime.action = { clip: 'skill', remaining: ACTION_SEC.skill };
      pending.push({ kind: 'skill', delay: PLAYER_STATS.skill.hitDelay });
      const { x, y, z } = playerRuntime.position;
      combatRuntime.skillFx = { x, y, z, age: -PLAYER_STATS.skill.hitDelay };
      audio.play('skill');
      audio.sparkle();
      playerRuntime.locomotion.vx = playerRuntime.locomotion.vz = 0;
    } else if (attackPressed && combatRuntime.attackCooldown <= 0) {
      combatRuntime.attackCooldown = PLAYER_STATS.attack.cooldown;
      playerRuntime.action = { clip: 'attack', remaining: ACTION_SEC.attack };
      pending.push({ kind: 'attack', delay: PLAYER_STATS.attack.hitDelay });
      audio.play('swing');
      playerRuntime.locomotion.vx = playerRuntime.locomotion.vz = 0;
    }
  });

  return null;
}
