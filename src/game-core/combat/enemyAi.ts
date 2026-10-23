// 敵人 AI 狀態機（規格 6.6）：待機、巡邏、追擊、攻擊、返回、死亡。純函式，位置與狀態由呼叫端保存（本機模擬）。
// 規則（傷害、死亡）在權威層；這裡只決定「怎麼動、什麼時候出手」。
import type { EnemyDef } from './combat';

// 任務 8B：orbit（飛蛾繞圈）、spit（芽怪吐泥前搖）、guard（甲蟲縮殼）、recover（甲蟲出手後的破綻）；retreat（菌帽小妖出手後跑開）
export type AiState = 'idle' | 'patrol' | 'chase' | 'orbit' | 'attack' | 'spit' | 'guard' | 'recover' | 'retreat' | 'return' | 'dead';

export type EnemyAi = {
  state: AiState;
  x: number;
  z: number;
  /** 面向（yaw，0 = +Z） */
  yaw: number;
  /** 目前狀態已持續的時間 */
  timer: number;
  /** 下次可以攻擊的剩餘時間 */
  cooldown: number;
  /** 巡邏目標點 */
  patrolTarget: { x: number; z: number } | null;
  /** 擊退速度（被打到時往後飄，逐漸衰減） */
  knockback: { x: number; z: number };
  /** 盤旋（orbit）：繞玩家的角度與這一輪已盤旋的時間 */
  orbitAngle: number;
  orbitFor: number;
  /** 吐泥（spit）的冷卻 */
  spitCooldown: number;
  /** 縮殼（guard）結束後多久內不會再縮殼（避免一直被打就一直縮著、永遠不還手） */
  guardCooldown: number;
};

/** 縮殼結束後的冷卻（秒） */
export const GUARD_COOLDOWN = 2.5;

export function createEnemyAi(x: number, z: number, yaw = 0): EnemyAi {
  return { state: 'idle', x, z, yaw, timer: 0, cooldown: 0, patrolTarget: null, knockback: { x: 0, z: 0 }, orbitAngle: 0, orbitFor: 0, spitCooldown: 0, guardCooldown: 0 };
}

export type AiInput = {
  dt: number;
  player: { x: number; z: number; alive: boolean };
  home: { x: number; z: number; radius: number };
  /** 巡邏時挑選目標點用的亂數 */
  random: () => number;
};

export type AiOutput = {
  /** 這一幀出手（攻擊前搖結束）：呼叫端送出攻擊指令，由權威層判定是否命中 */
  strike: boolean;
  /** 這一幀吐出泥團（吐泥前搖結束）：瞄準的位置（出手當下玩家的位置） */
  spit: { x: number; z: number } | null;
  /** 這一幀吐完後向後瞬移（霧鷺影）：瞬移前的位置（泥團 / 霧羽從這裡射出、留下一團霧） */
  blink: { x: number; z: number } | null;
};

/** 盤旋時離目標點多近才開始繞圈（超過時先飛過去） */
const ORBIT_ENTER = 1.6;

const IDLE_SEC = 2.5;
const KNOCKBACK_DECAY = 6;

function moveToward(ai: EnemyAi, tx: number, tz: number, speed: number, dt: number): number {
  const dx = tx - ai.x;
  const dz = tz - ai.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-4) return 0;
  const step = Math.min(dist, speed * dt);
  ai.x += (dx / dist) * step;
  ai.z += (dz / dist) * step;
  ai.yaw = Math.atan2(dx, dz);
  return dist - step;
}

/** 推進一步。直接修改 ai（每幀呼叫，避免配置）。 */
export function stepEnemyAi(ai: EnemyAi, def: EnemyDef, input: AiInput): AiOutput {
  const { dt, player, home } = input;
  let strike = false;
  let spit: AiOutput['spit'] = null;
  let blink: AiOutput['blink'] = null;
  const behavior = def.behavior;
  ai.timer += dt;
  ai.cooldown = Math.max(0, ai.cooldown - dt);
  ai.spitCooldown = Math.max(0, ai.spitCooldown - dt);
  ai.guardCooldown = Math.max(0, ai.guardCooldown - dt);

  // 擊退（任何狀態都會被推開，死亡除外）
  if (ai.state !== 'dead') {
    ai.x += ai.knockback.x * dt;
    ai.z += ai.knockback.z * dt;
    const decay = Math.exp(-KNOCKBACK_DECAY * dt);
    ai.knockback.x *= decay;
    ai.knockback.z *= decay;
  }

  const toPlayer = Math.hypot(player.x - ai.x, player.z - ai.z);
  const fromHome = Math.hypot(ai.x - home.x, ai.z - home.z);
  const set = (state: AiState) => {
    ai.state = state;
    ai.timer = 0;
  };

  switch (ai.state) {
    case 'dead':
      break;
    case 'idle':
    case 'patrol': {
      if (player.alive && toPlayer <= def.aggroRadius && fromHome <= def.leashRadius) {
        set('chase');
        break;
      }
      if (ai.state === 'idle') {
        if (ai.timer >= IDLE_SEC) {
          const a = input.random() * Math.PI * 2;
          const r = Math.sqrt(input.random()) * home.radius;
          ai.patrolTarget = { x: home.x + Math.cos(a) * r, z: home.z + Math.sin(a) * r };
          set('patrol');
        }
        break;
      }
      const target = ai.patrolTarget ?? home;
      if (moveToward(ai, target.x, target.z, def.moveSpeed * 0.45, dt) <= 0.05) set('idle');
      break;
    }
    case 'chase':
    case 'orbit':
      if (!player.alive || fromHome > def.leashRadius) {
        set('return');
        break;
      }
      if (toPlayer > def.aggroRadius * 1.6) {
        set('return');
        break;
      }
      // 霧孢飛蛾：先在玩家周圍盤旋一段時間，才俯衝出手（Bible §6.6：繞玩家盤旋）
      if (behavior?.kind === 'orbit' && ai.orbitFor < behavior.sec) {
        if (ai.state === 'chase' && toPlayer <= behavior.radius + ORBIT_ENTER) {
          ai.orbitAngle = Math.atan2(ai.z - player.z, ai.x - player.x);
          set('orbit');
        }
        if (ai.state === 'orbit') {
          ai.orbitFor += dt;
          ai.orbitAngle += (behavior.speed / behavior.radius) * dt;
          const tx = player.x + Math.cos(ai.orbitAngle) * behavior.radius;
          const tz = player.z + Math.sin(ai.orbitAngle) * behavior.radius;
          moveToward(ai, tx, tz, Math.max(def.moveSpeed, behavior.speed) * 1.2, dt);
          // 盤旋時看著玩家
          ai.yaw = Math.atan2(player.x - ai.x, player.z - ai.z);
          break;
        }
      } else if (ai.state === 'orbit') {
        set('chase');
      }
      // 迷霧芽怪：距離適中時吐泥團（近身時改用咬）
      if (behavior?.kind === 'spit' && ai.spitCooldown <= 0 && toPlayer >= behavior.minRange && toPlayer <= behavior.range) {
        ai.yaw = Math.atan2(player.x - ai.x, player.z - ai.z);
        set('spit');
        break;
      }
      if (toPlayer <= def.attackRange && ai.cooldown <= 0) {
        ai.yaw = Math.atan2(player.x - ai.x, player.z - ai.z);
        set('attack');
        break;
      }
      // 保持在攻擊距離邊緣，不貼進玩家身體
      if (toPlayer > def.attackRange * 0.8) moveToward(ai, player.x, player.z, def.moveSpeed, dt);
      else ai.yaw = Math.atan2(player.x - ai.x, player.z - ai.z);
      break;
    case 'attack':
      // 前搖結束時出手一次，之後回到追擊
      if (ai.timer >= def.attackWindup) {
        strike = true;
        ai.cooldown = def.attackCooldown;
        // 衝撞型（角角龍等）：出手時往面向衝出，速度之後隨擊退一起衰減
        if (def.lunge) {
          ai.knockback.x = Math.sin(ai.yaw) * def.lunge;
          ai.knockback.z = Math.cos(ai.yaw) * def.lunge;
        }
        ai.orbitFor = 0;
        // 根鬚甲蟲、鏡殼蟹：出手後有一段停下來的破綻；菌帽小妖：出手後跑開
        set(behavior?.kind === 'shell' || behavior?.kind === 'carapace' ? 'recover' : behavior?.kind === 'skirmish' ? 'retreat' : 'chase');
      }
      break;
    case 'spit':
      if (behavior?.kind !== 'spit') {
        set('chase');
        break;
      }
      ai.yaw = Math.atan2(player.x - ai.x, player.z - ai.z);
      if (ai.timer >= behavior.windup) {
        spit = { x: player.x, z: player.z };
        ai.spitCooldown = behavior.cooldown;
        // 霧鷺影：射出霧羽後向後瞬移（離開玩家的方向），不會離開巡邏範圍太遠
        if (behavior.retreat) {
          blink = { x: ai.x, z: ai.z };
          const away = Math.atan2(ai.x - player.x, ai.z - player.z);
          let nx = ai.x + Math.sin(away) * behavior.retreat;
          let nz = ai.z + Math.cos(away) * behavior.retreat;
          const out = Math.hypot(nx - home.x, nz - home.z) - def.leashRadius * 0.8;
          if (out > 0) {
            // 往家的方向拉回來
            const back = Math.atan2(home.x - nx, home.z - nz);
            nx += Math.sin(back) * out;
            nz += Math.cos(back) * out;
          }
          ai.x = nx;
          ai.z = nz;
        }
        set('chase');
      }
      break;
    case 'guard':
      // 縮在殼裡不動，時間到再繼續追
      if (behavior?.kind !== 'shell' || ai.timer >= behavior.guardSec) {
        // 從殼裡出來就馬上反擊
        ai.guardCooldown = GUARD_COOLDOWN;
        ai.cooldown = 0;
        set('chase');
      }
      break;
    case 'recover':
      if ((behavior?.kind !== 'shell' && behavior?.kind !== 'carapace') || ai.timer >= behavior.recoverSec) set('chase');
      break;
    case 'retreat': {
      if (behavior?.kind !== 'skirmish' || ai.timer >= behavior.retreatSec || !player.alive) {
        set('chase');
        break;
      }
      // 往遠離玩家的方向跑，但不跑出巡邏範圍（超出時改往家的方向）
      const away = Math.atan2(ai.x - player.x, ai.z - player.z);
      let tx = ai.x + Math.sin(away) * 2;
      let tz = ai.z + Math.cos(away) * 2;
      if (Math.hypot(tx - home.x, tz - home.z) > def.leashRadius * 0.8) {
        tx = home.x;
        tz = home.z;
      }
      moveToward(ai, tx, tz, behavior.retreatSpeed, dt);
      break;
    }
    case 'return':
      if (moveToward(ai, home.x, home.z, def.moveSpeed * 1.2, dt) <= 0.3) set('idle');
      break;
  }
  return { strike, spit, blink };
}

/** 攻擊者是否在敵人的正面（面向兩側 arcDeg / 2 以內） */
export function isInFront(ai: EnemyAi, from: { x: number; z: number }, arcDeg: number): boolean {
  const toward = Math.atan2(from.x - ai.x, from.z - ai.z);
  const diff = Math.atan2(Math.sin(toward - ai.yaw), Math.cos(toward - ai.yaw));
  return Math.abs(diff) <= (arcDeg * Math.PI) / 360;
}

/**
 * 目前的姿態（給權威層計算受到的傷害倍率）。
 * 鏡殼蟹（carapace）依攻擊者的方位：破綻中一律 recover；否則從正面打是 guard（鏡殼擋住）。
 */
export function aiStance(ai: EnemyAi, def?: EnemyDef, from?: { x: number; z: number }): 'guard' | 'recover' | undefined {
  if (def?.behavior?.kind === 'carapace') {
    if (ai.state === 'dead') return undefined;
    if (ai.state === 'recover') return 'recover';
    return from && isInFront(ai, from, def.behavior.arcDeg) ? 'guard' : undefined;
  }
  return ai.state === 'guard' || ai.state === 'recover' ? ai.state : undefined;
}

/**
 * 被擊中：往遠離玩家的方向擊退；在返回途中被打會重新追擊。
 * 根鬚甲蟲（shell）被打到會縮殼（破綻中與出手前搖時不會）；縮殼時幾乎推不動。
 */
export function applyHitReaction(ai: EnemyAi, from: { x: number; z: number }, strength: number, def?: EnemyDef): void {
  if (ai.state === 'dead') return;
  const shell = def?.behavior?.kind === 'shell';
  // 鏡殼蟹：正面被打幾乎推不動，也不會被打斷出手
  if (def?.behavior?.kind === 'carapace' && ai.state !== 'recover' && isInFront(ai, from, def.behavior.arcDeg)) {
    const dx = ai.x - from.x;
    const dz = ai.z - from.z;
    const d = Math.hypot(dx, dz) || 1;
    ai.knockback.x = (dx / d) * strength * 0.15;
    ai.knockback.z = (dz / d) * strength * 0.15;
    if (ai.state !== 'attack' && ai.state !== 'spit') {
      ai.state = 'chase';
      ai.timer = 0;
    }
    return;
  }
  // 縮殼（已經縮著，或不在出手 / 破綻中且縮殼冷卻已過）：幾乎推不動
  const guards = shell && ai.state !== 'attack' && ai.state !== 'recover' && (ai.state === 'guard' || ai.guardCooldown <= 0);
  const dx = ai.x - from.x;
  const dz = ai.z - from.z;
  const d = Math.hypot(dx, dz) || 1;
  const k = guards ? 0.2 : 1;
  ai.knockback.x = (dx / d) * strength * k;
  ai.knockback.z = (dz / d) * strength * k;
  if (guards) {
    if (ai.state !== 'guard') {
      ai.state = 'guard';
      ai.timer = 0;
    }
    return;
  }
  // 跑開中被打不會回頭（打了就跑的怪物要追著打）
  if (ai.state !== 'attack' && ai.state !== 'recover' && ai.state !== 'spit' && ai.state !== 'retreat') {
    ai.state = 'chase';
    ai.timer = 0;
  }
}

/** 依玩家距離決定 AI 更新間隔（規格 6.6：依距離降頻，超出範圍暫停）；null 表示暫停 */
export function aiUpdateInterval(distanceToPlayer: number): number | null {
  if (distanceToPlayer > 60) return null;
  if (distanceToPlayer > 30) return 0.25;
  return 0;
}
