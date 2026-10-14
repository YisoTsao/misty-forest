// 頭目 AI（任務 8D，Bible §6.5、§27.4）：開場、追擊、三種招式（根刺、跳躍震地、睡眠孢子）、縮入菌傘、震地後的破綻。
// 純函式：位置與面向放在一般敵人的 EnemyAi（命中判定、小地圖共用），頭目自己的狀態放在 BossAi。
// 招式的傷害由權威層結算（EnemyStrike 帶 move）；這裡只決定「什麼時候、打在哪裡」，命中與否由 bossStrikeHits 判斷。
import type { BossDef, BossMoveId } from './combat';
import type { EnemyAi } from './enemyAi';

export type BossState = 'intro' | 'chase' | 'spikes' | 'slam' | 'air' | 'recover' | 'spores' | 'guard' | 'dead';

export type BossAi = {
  state: BossState;
  /** 目前狀態已持續的時間 */
  timer: number;
  /** 下次可以出招的剩餘時間 */
  cooldown: number;
  /** 回到追擊後累計被打的次數（達到 guard.afterHits 就縮入菌傘） */
  hits: number;
  /** 1：一般；2：血量低於 phase2Below 之後（根刺更多、冷卻更短），不會回到 1 */
  phase: 1 | 2;
  /** 根刺的地面標記 */
  markers: { x: number; z: number }[];
  /** 跳躍震地的起點與落點 */
  slamFrom: { x: number; z: number };
  slamTo: { x: number; z: number };
  lastMove: BossMoveId | null;
};

export type BossStrike =
  | { move: 'spikes'; points: { x: number; z: number }[]; radius: number }
  | { move: 'slam'; x: number; z: number; radius: number }
  | { move: 'spores'; x: number; z: number; yaw: number; range: number; arcDeg: number };

export type BossInput = {
  dt: number;
  player: { x: number; z: number; alive: boolean };
  /** 目前血量 / 最大血量 */
  hpRatio: number;
  random: () => number;
  /** 除錯與測試：下一招一定用這招（冷卻結束時） */
  force?: BossMoveId;
};

export type BossOutput = { strike: BossStrike | null; phaseChanged: boolean };

/** 頭目身體的半徑（避開樹幹、留在戰場內用） */
export const BOSS_BODY_RADIUS = 1.6;
/** 追擊時停在離玩家這個距離 */
const KEEP_DISTANCE = 3.2;
/** 開場結束、縮殼結束後第一招前的等待 */
const OPENING_COOLDOWN = 1;
/** 跳躍震地落在玩家前方這麼遠（頭目身體半徑 + 玩家身體 + 一點空隙） */
const SLAM_SHORT = BOSS_BODY_RADIUS + 0.9;
/** 玩家身體的半徑（根刺標記邊緣擦到也算） */
export const PLAYER_HIT_RADIUS = 0.4;

export function createBossAi(): BossAi {
  return { state: 'intro', timer: 0, cooldown: OPENING_COOLDOWN, hits: 0, phase: 1, markers: [], slamFrom: { x: 0, z: 0 }, slamTo: { x: 0, z: 0 }, lastMove: null };
}

/** 把位置限制在戰場內、樹幹外 */
export function clampToArena(def: BossDef, p: { x: number; z: number }, margin = BOSS_BODY_RADIUS): { x: number; z: number } {
  let { x, z } = p;
  const [cx, cz] = def.arena.center;
  const max = def.arena.radius - margin;
  const d = Math.hypot(x - cx, z - cz);
  if (d > max) {
    x = cx + ((x - cx) / d) * max;
    z = cz + ((z - cz) / d) * max;
  }
  if (def.avoid) {
    const [ax, az] = def.avoid.center;
    const min = def.avoid.radius + margin;
    const da = Math.hypot(x - ax, z - az);
    if (da < min) {
      // 剛好在中心時往戰場入口的反方向推開（不會發生在一般情況，避免除以 0）
      const nx = da > 1e-4 ? (x - ax) / da : 1;
      const nz = da > 1e-4 ? (z - az) / da : 0;
      x = ax + nx * min;
      z = az + nz * min;
    }
  }
  return { x, z };
}

function face(ai: EnemyAi, x: number, z: number): void {
  if (Math.hypot(x - ai.x, z - ai.z) > 1e-4) ai.yaw = Math.atan2(x - ai.x, z - ai.z);
}

function moveToward(ai: EnemyAi, def: BossDef, tx: number, tz: number, speed: number, dt: number): void {
  const dx = tx - ai.x;
  const dz = tz - ai.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-4) return;
  const step = Math.min(dist, speed * dt);
  let x = ai.x + (dx / dist) * step;
  let z = ai.z + (dz / dist) * step;
  // 樹幹擋在中間時沿著樹幹繞過去（往切線方向滑）
  if (def.avoid) {
    const [ax, az] = def.avoid.center;
    const min = def.avoid.radius + BOSS_BODY_RADIUS;
    if (Math.hypot(x - ax, z - az) < min) {
      const rx = ai.x - ax;
      const rz = ai.z - az;
      const r = Math.hypot(rx, rz) || 1;
      // 兩個切線方向中，選擇比較接近目標的那個
      const t1 = { x: -rz / r, z: rx / r };
      const sign = t1.x * dx + t1.z * dz >= 0 ? 1 : -1;
      x = ai.x + t1.x * sign * step;
      z = ai.z + t1.z * sign * step;
    }
  }
  const p = clampToArena(def, { x, z });
  ai.x = p.x;
  ai.z = p.z;
  ai.yaw = Math.atan2(dx, dz);
}

function chooseMove(boss: BossAi, def: BossDef, dist: number, random: () => number): BossMoveId {
  const { slam, spores } = def.moves;
  const options: BossMoveId[] = ['spikes'];
  if (dist >= slam.minRange) options.push('slam', 'slam');
  if (dist <= spores.range * 0.8) options.push('spores', 'spores');
  // 不連續用同一招（有其他選擇時）
  const fresh = options.filter((m) => m !== boss.lastMove);
  const pool = fresh.length > 0 ? fresh : options;
  return pool[Math.floor(random() * pool.length) % pool.length]!;
}

function startMove(ai: EnemyAi, boss: BossAi, def: BossDef, move: BossMoveId, player: { x: number; z: number }, random: () => number): void {
  boss.state = move;
  boss.timer = 0;
  boss.lastMove = move;
  face(ai, player.x, player.z);
  if (move === 'spikes') {
    const { count, count2, spread } = def.moves.spikes;
    const n = boss.phase === 2 ? count2 : count;
    // 第一根在玩家腳下，其餘平均分布在周圍（起始角度隨機）
    const start = random() * Math.PI * 2;
    boss.markers = [clampToArena(def, player, 0.8)];
    for (let i = 1; i < n; i++) {
      const a = start + ((i - 1) / Math.max(1, n - 1)) * Math.PI * 2;
      boss.markers.push(clampToArena(def, { x: player.x + Math.cos(a) * spread, z: player.z + Math.sin(a) * spread }, 0.8));
    }
  } else if (move === 'slam') {
    // 落在玩家面前（不壓在玩家身上）：站著不動仍在震波範圍內，往外跑才躲得開
    boss.slamFrom = { x: ai.x, z: ai.z };
    const dx = player.x - ai.x;
    const dz = player.z - ai.z;
    const d = Math.hypot(dx, dz);
    const short = Math.min(d, SLAM_SHORT);
    const to = d > 1e-4 ? { x: player.x - (dx / d) * short, z: player.z - (dz / d) * short } : { x: player.x, z: player.z };
    boss.slamTo = clampToArena(def, to);
  }
}

/** 推進一步。直接修改 ai（位置）與 boss（狀態）。 */
export function stepBossAi(ai: EnemyAi, boss: BossAi, def: BossDef, input: BossInput): BossOutput {
  const { dt, player, random } = input;
  let strike: BossStrike | null = null;
  let phaseChanged = false;
  if (boss.state === 'dead') return { strike, phaseChanged };
  boss.timer += dt;
  boss.cooldown = Math.max(0, boss.cooldown - dt);
  if (boss.phase === 1 && input.hpRatio <= def.phase2Below) {
    boss.phase = 2;
    phaseChanged = true;
  }
  const cooldownScale = boss.phase === 2 ? def.phase2Cooldown : 1;
  const set = (state: BossState) => {
    boss.state = state;
    boss.timer = 0;
  };
  const dist = Math.hypot(player.x - ai.x, player.z - ai.z);

  switch (boss.state) {
    case 'intro':
      face(ai, player.x, player.z);
      if (boss.timer >= def.introSec) set('chase');
      break;
    case 'chase': {
      if (boss.hits >= def.guard.afterHits) {
        boss.hits = 0;
        set('guard');
        break;
      }
      if (!player.alive) break;
      if (boss.cooldown <= 0) {
        startMove(ai, boss, def, input.force ?? chooseMove(boss, def, dist, random), player, random);
        break;
      }
      if (dist > KEEP_DISTANCE) moveToward(ai, def, player.x, player.z, def.moveSpeed, dt);
      else face(ai, player.x, player.z);
      break;
    }
    case 'spikes':
      if (boss.timer >= def.moves.spikes.windup) {
        strike = { move: 'spikes', points: boss.markers.map((m) => ({ ...m })), radius: def.moves.spikes.radius };
        boss.cooldown = def.moves.spikes.cooldown * cooldownScale;
        set('chase');
      }
      break;
    case 'slam':
      // 蹲下蓄力：落點已經標出來了
      face(ai, boss.slamTo.x, boss.slamTo.z);
      if (boss.timer >= def.moves.slam.windup) set('air');
      break;
    case 'air': {
      const t = Math.min(1, boss.timer / def.moves.slam.air);
      ai.x = boss.slamFrom.x + (boss.slamTo.x - boss.slamFrom.x) * t;
      ai.z = boss.slamFrom.z + (boss.slamTo.z - boss.slamFrom.z) * t;
      if (t >= 1) {
        strike = { move: 'slam', x: boss.slamTo.x, z: boss.slamTo.z, radius: def.moves.slam.radius };
        set('recover');
      }
      break;
    }
    case 'recover':
      // 震地後根腳卡在地上：破綻（受到的傷害較多）
      if (boss.timer >= def.moves.slam.recoverSec) {
        boss.cooldown = def.moves.slam.cooldown * cooldownScale;
        set('chase');
      }
      break;
    case 'spores': {
      const { windup, range, arcDeg } = def.moves.spores;
      // 前 60% 的前搖會轉向玩家，之後方向固定（看得出往哪吹、躲得開）
      if (boss.timer < windup * 0.6) face(ai, player.x, player.z);
      if (boss.timer >= windup) {
        strike = { move: 'spores', x: ai.x, z: ai.z, yaw: ai.yaw, range, arcDeg };
        boss.cooldown = def.moves.spores.cooldown * cooldownScale;
        set('chase');
      }
      break;
    }
    case 'guard':
      if (boss.timer >= def.guard.sec) {
        boss.hits = 0;
        boss.cooldown = 0;
        set('chase');
      }
      break;
  }
  return { strike, phaseChanged };
}

/** 被玩家打到：累計次數（追擊中連續被打會縮入菌傘）；頭目不會被擊退或打斷 */
export function onBossHit(boss: BossAi): void {
  if (boss.state === 'chase' || boss.state === 'spikes' || boss.state === 'spores') boss.hits += 1;
}

/** 頭目目前的姿態（給權威層計算傷害倍率） */
export function bossStance(boss: BossAi): 'guard' | 'recover' | undefined {
  return boss.state === 'guard' || boss.state === 'recover' ? boss.state : undefined;
}

/** 玩家是否被招式打中 */
export function bossStrikeHits(strike: BossStrike, player: { x: number; z: number }): boolean {
  switch (strike.move) {
    case 'spikes':
      return strike.points.some((p) => Math.hypot(player.x - p.x, player.z - p.z) <= strike.radius + PLAYER_HIT_RADIUS);
    case 'slam':
      return Math.hypot(player.x - strike.x, player.z - strike.z) <= strike.radius + PLAYER_HIT_RADIUS;
    case 'spores': {
      const dx = player.x - strike.x;
      const dz = player.z - strike.z;
      const d = Math.hypot(dx, dz);
      if (d > strike.range + PLAYER_HIT_RADIUS) return false;
      // 貼在身上時一定吹得到
      if (d < BOSS_BODY_RADIUS + PLAYER_HIT_RADIUS) return true;
      let a = Math.atan2(dx, dz) - strike.yaw;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      return Math.abs(a) <= ((strike.arcDeg / 2) * Math.PI) / 180;
    }
  }
}
