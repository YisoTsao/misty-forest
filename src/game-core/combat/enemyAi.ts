// 敵人 AI 狀態機（規格 6.6）：待機、巡邏、追擊、攻擊、返回、死亡。純函式，位置與狀態由呼叫端保存（本機模擬）。
// 規則（傷害、死亡）在權威層；這裡只決定「怎麼動、什麼時候出手」。
import type { EnemyDef } from './combat';

export type AiState = 'idle' | 'patrol' | 'chase' | 'attack' | 'return' | 'dead';

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
};

export function createEnemyAi(x: number, z: number, yaw = 0): EnemyAi {
  return { state: 'idle', x, z, yaw, timer: 0, cooldown: 0, patrolTarget: null, knockback: { x: 0, z: 0 } };
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
};

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
  ai.timer += dt;
  ai.cooldown = Math.max(0, ai.cooldown - dt);

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
      if (!player.alive || fromHome > def.leashRadius) {
        set('return');
        break;
      }
      if (toPlayer > def.aggroRadius * 1.6) {
        set('return');
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
        set('chase');
      }
      break;
    case 'return':
      if (moveToward(ai, home.x, home.z, def.moveSpeed * 1.2, dt) <= 0.3) set('idle');
      break;
  }
  return { strike };
}

/** 被擊中：往遠離玩家的方向擊退；在返回途中被打會重新追擊 */
export function applyHitReaction(ai: EnemyAi, from: { x: number; z: number }, strength: number): void {
  if (ai.state === 'dead') return;
  const dx = ai.x - from.x;
  const dz = ai.z - from.z;
  const d = Math.hypot(dx, dz) || 1;
  ai.knockback.x = (dx / d) * strength;
  ai.knockback.z = (dz / d) * strength;
  if (ai.state !== 'attack') {
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
