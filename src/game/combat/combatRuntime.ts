// 本機暫態：敵人的位置與 AI（由本機模擬）、玩家的冷卻與受傷表現、傷害數字。
// 敵人「存在與血量」是權威狀態；這裡依權威層的事件建立 / 移除對應的模擬與表現。
import { create } from 'zustand';
import type { GameState } from '@/game-core/authority/rules';
import { createEnemyAi, type EnemyAi } from '@/game-core/combat/enemyAi';
import { createCombo, DEFAULT_WEAPON, type ComboState } from '@/game-core/combat/weapons';
import { terrainHeight } from '@/game-core/world/terrain';
import { authority, combat, spells, weapons } from '../authority';
import { playerRuntime } from '../player/localRuntime';

export type EnemyVisual = {
  ai: EnemyAi;
  kind: string;
  spawner: string;
  /** 生成時淡入（0 → 1） */
  fadeIn: number;
  /** 被擊中的閃白（秒，倒數） */
  flash: number;
  /** 被擊敗或消散後的淡出時間（秒，正數表示正在消失） */
  vanishing: number | null;
  /** AI 降頻用：距離上次更新的時間 */
  sinceUpdate: number;
};

export const enemyRuntime = new Map<string, EnemyVisual>();

/** 畫面上要渲染的敵人 id（加入 / 移除時才更新，元件不必每幀比對） */
export const useEnemyListStore = create<{ ids: string[] }>(() => ({ ids: [] }));
const publishList = () => useEnemyListStore.setState({ ids: [...enemyRuntime.keys()] });

export type DamageNumber = { id: number; x: number; y: number; z: number; amount: number; target: 'enemy' | 'player'; age: number };

export const combatRuntime = {
  attackCooldown: 0,
  skillCooldown: 0,
  /** 受傷後的無敵時間（本機判定，避免同一瞬間被多隻連續命中） */
  invulnerable: 0,
  /** 受傷畫面閃紅（秒，倒數） */
  hurtFlash: 0,
  /** 倒下後經過的時間 */
  defeatedFor: 0,
  damageNumbers: [] as DamageNumber[],
  /** 近戰（GAME_DESIGN 5.3）：連段、重擊冷卻、命中停頓、切換武器的出現動畫 */
  melee: {
    combo: createCombo(DEFAULT_WEAPON) as ComboState,
    /** 本機時鐘（秒）：連段期限以此計算，暫停時不前進 */
    clock: 0,
    /** HUD：目前連段的第幾招（0 表示沒有），顯示到 comboUntil */
    comboCount: 0,
    comboUntil: 0,
    heavyCooldown: 0,
    heavyCooldownTotal: 1,
    /** 目前輕擊動作的長度（HUD 冷卻遮罩用） */
    lightTotal: 1,
    /** 命中停頓剩餘時間（秒）：角色動畫暫停，打擊感 */
    hitStop: 0,
    /** 切換武器後的出現動畫進度（0 → 1） */
    equipPop: 1,
    /** 角色模型手上實際顯示的武器（CharacterModel 寫入；除錯與測試用） */
    shown: null as string | null,
  },
  /** 揮砍拖尾的取樣（世界座標，最新在後）；CharacterModel 寫入、WeaponTrail 渲染 */
  trail: [] as TrailSample[],
  /** 命中特效（火花 / 拳腳的衝擊塵）：位置與經過時間 */
  impacts: [] as Impact[],
};

export type TrailSample = { tip: [number, number, number]; base: [number, number, number]; age: number };
export type Impact = { id: number; x: number; y: number; z: number; age: number; kind: 'spark' | 'dust'; power: number };
let nextImpactId = 1;

export function pushImpact(i: Omit<Impact, 'id' | 'age'>): void {
  combatRuntime.impacts.push({ ...i, id: nextImpactId++, age: 0 });
  if (combatRuntime.impacts.length > 12) combatRuntime.impacts.shift();
}
let nextNumberId = 1;

export function pushDamageNumber(n: Omit<DamageNumber, 'id' | 'age'>): void {
  combatRuntime.damageNumbers.push({ ...n, id: nextNumberId++, age: 0 });
  if (combatRuntime.damageNumbers.length > 24) combatRuntime.damageNumbers.shift();
}

/** 新生成的敵人離玩家至少這麼遠，避免在眼前冒出來 */
const SPAWN_MIN_PLAYER_DIST = 8;

function spawnPosition(spawnerId: string): { x: number; z: number } {
  const spawner = combat.spawners.find((s) => s.id === spawnerId);
  if (!spawner) return { x: playerRuntime.position.x + 20, z: playerRuntime.position.z };
  const [cx, cz] = spawner.center;
  let best = { x: cx, z: cz };
  let bestDist = -1;
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * spawner.radius;
    const p = { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r };
    const d = Math.hypot(p.x - playerRuntime.position.x, p.z - playerRuntime.position.z);
    if (d >= SPAWN_MIN_PLAYER_DIST) return p;
    if (d > bestDist) {
      best = p;
      bestDist = d;
    }
  }
  return best;
}

function addEnemy(id: string, kind: string, spawner: string): void {
  const { x, z } = spawnPosition(spawner);
  enemyRuntime.set(id, { ai: createEnemyAi(x, z, Math.random() * Math.PI * 2), kind, spawner, fadeIn: 0, flash: 0, vanishing: null, sinceUpdate: 0 });
}

/** 讓本機模擬與權威狀態一致（讀檔、新遊戲時整個替換） */
function rebuild(state: GameState): void {
  for (const [id, v] of enemyRuntime) if (!state.enemies.has(id) && v.vanishing === null) enemyRuntime.delete(id);
  for (const e of state.enemies.values()) if (!enemyRuntime.has(e.id)) addEnemy(e.id, e.kind, e.spawner);
  publishList();
}

/** 淡出結束後由 Enemies 呼叫 */
export function removeEnemyVisual(id: string): void {
  if (enemyRuntime.delete(id)) publishList();
}

export function enemyY(x: number, z: number): number {
  return terrainHeight(x, z);
}

/** 依權威層事件更新本機模擬與表現。只在啟動時安裝一次。 */
export function installCombatRuntime(): void {
  authority.subscribe((events, state) => {
    if (events.length === 0) {
      rebuild(state);
      return;
    }
    let changed = false;
    for (const e of events) {
      switch (e.type) {
        case 'EnemySpawned':
          addEnemy(e.enemyId, e.kind, e.spawner);
          changed = true;
          break;
        case 'EnemyDamaged': {
          const v = enemyRuntime.get(e.enemyId);
          if (!v) break;
          v.flash = 0.18;
          const { x, z } = playerRuntime.position;
          // 擊退：往遠離玩家的方向（規格 6.6）
          const dx = v.ai.x - x;
          const dz = v.ai.z - z;
          const d = Math.hypot(dx, dz) || 1;
          const knockback = spells.get(e.attack)?.knockback ?? weapons.moves.get(e.attack)?.move.knockback ?? 0;
          v.ai.knockback.x = (dx / d) * knockback;
          v.ai.knockback.z = (dz / d) * knockback;
          if (v.ai.state !== 'attack') {
            v.ai.state = 'chase';
            v.ai.timer = 0;
          }
          pushDamageNumber({ x: v.ai.x, y: enemyY(v.ai.x, v.ai.z) + 1.9, z: v.ai.z, amount: e.amount, target: 'enemy' });
          break;
        }
        case 'EnemyDefeated':
        case 'EnemyDespawned': {
          const v = enemyRuntime.get(e.enemyId);
          if (v) {
            v.vanishing = 0;
            v.ai.state = 'dead';
          }
          break;
        }
        case 'PlayerDamaged': {
          combatRuntime.invulnerable = 0.6;
          combatRuntime.hurtFlash = 0.35;
          const { x, y, z } = playerRuntime.position;
          pushDamageNumber({ x, y: y + 1.3, z, amount: e.amount, target: 'player' });
          // 沒有在做其他動作時播放受傷動畫
          if (!playerRuntime.action) playerRuntime.action = { clip: 'hit', remaining: 0.35 };
          break;
        }
        case 'PlayerDefeated':
          combatRuntime.defeatedFor = 0;
          playerRuntime.action = { clip: 'death', remaining: Infinity };
          break;
        case 'PlayerRespawned':
          playerRuntime.action = null;
          break;
      }
    }
    if (changed) publishList();
  });
}
