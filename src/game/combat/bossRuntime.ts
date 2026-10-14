// 頭目戰的本機端（任務 8D）：走進戰場開戰、離開戰場結束、推進頭目 AI、招式命中交給權威層、HUD 狀態與提示。
// 開戰 / 結束 / 傷害都是權威指令；這裡只做「玩家在哪裡、有沒有被打到」的本機判定。
import { create } from 'zustand';
import { filledTroughs } from '@/game-core/authority/rules';
import { bossStrikeHits, stepBossAi, type BossState, type BossStrike } from '@/game-core/combat/bossAi';
import { bossRequirementsMet, type BossDef, type BossMoveId, type EnemyDef } from '@/game-core/combat/combat';
import { isControllable } from '@/game-core/flow/gameFlow';
import { terrainHeight } from '@/game-core/world/terrain';
import { authority, combat, worldIndex } from '../authority';
import { companionSay } from '../companion/companionRuntime';
import { t } from '../i18n';
import { cameraRuntime, playerRuntime } from '../player/localRuntime';
import { useDebugStore } from '../state/debugStore';
import { currentScreen } from '../state/gameStore';
import { useSettingsStore } from '../state/settingsStore';
import { useUiStore } from '../state/uiStore';
import { vfx } from '../vfx/vfxQueue';
import { combatRuntime, enemyRuntime, type EnemyVisual } from './combatRuntime';

const bosses = [...combat.enemies.values()].filter((e): e is EnemyDef & { boss: BossDef } => e.boss !== undefined);

/** HUD 顯示的頭目戰狀態（只在數值改變時更新） */
export type BossHud = { enemyId: string; bossId: string; hp: number; maxHp: number; filled: number; total: number; phase: 1 | 2; state: BossState };
export const useBossStore = create<{ hud: BossHud | null }>(() => ({ hud: null }));

function patchHud(change: Partial<BossHud>): void {
  const hud = useBossStore.getState().hud;
  if (!hud) return;
  if (Object.entries(change).every(([k, v]) => hud[k as keyof BossHud] === v)) return;
  useBossStore.setState({ hud: { ...hud, ...change } });
}

/** 離開戰場這麼遠（超過戰場半徑）就結束這場戰鬥 */
const LEAVE_MARGIN = 6;
/** 開戰指令被拒絕後隔多久再試（秒） */
const START_RETRY_SEC = 1;
let startCooldown = 0;

function inArena(boss: BossDef, x: number, z: number, margin: number): boolean {
  return Math.hypot(x - boss.arena.center[0], z - boss.arena.center[1]) <= boss.arena.radius + margin;
}

/** 倒下時在頭目戰場附近：在戰場入口外重新站起來（Bible §27.4 失敗後重試）；不在任何戰場時回傳 null */
export function bossRetryPoint(x: number, z: number): { x: number; z: number } | null {
  for (const { boss } of bosses) if (inArena(boss, x, z, 10)) return { x: boss.retryAt[0], z: boss.retryAt[1] };
  return null;
}

/** 正在戰鬥中的頭目敵人 id（沒有時 null） */
export function activeBossEnemy(bossId: string): string | null {
  for (const e of authority.getState().enemies.values()) if (e.kind === bossId) return e.id;
  return null;
}

/** 每幀：玩家走進戰場就開戰，離開戰場就結束（頭目回去，下次重新開戰） */
export function stepBossArenas(dt: number): void {
  startCooldown = Math.max(0, startCooldown - dt);
  if (!isControllable(currentScreen())) return;
  const state = authority.getState();
  if (state.player.defeated) return;
  const { x, z } = playerRuntime.position;
  for (const def of bosses) {
    const fighting = activeBossEnemy(def.id);
    if (fighting) {
      if (!inArena(def.boss, x, z, LEAVE_MARGIN)) {
        authority.send({ type: 'EndBossFight', boss: def.id });
        useUiStore.getState().pushToast({ textKey: 'boss.left' });
      }
      continue;
    }
    if (startCooldown > 0 || state.defeatedBosses.includes(def.id)) continue;
    if (!bossRequirementsMet(def.boss, state.quests)) continue;
    if (Math.hypot(x - def.boss.arena.center[0], z - def.boss.arena.center[1]) > def.boss.arena.trigger) continue;
    startCooldown = START_RETRY_SEC;
    authority.send({ type: 'StartBossFight', boss: def.id });
  }
}

/** 推進頭目 AI（Enemies 每幀呼叫）；招式結束時判定玩家有沒有被打到 */
export function updateBossAi(id: string, v: EnemyVisual, def: EnemyDef & { boss: BossDef }, dt: number): void {
  const boss = v.boss;
  if (!boss || !isControllable(currentScreen()) || v.vanishing !== null) return;
  const state = authority.getState();
  const enemy = state.enemies.get(id);
  const alive = !state.player.defeated && !useDebugStore.getState().peaceful;
  const player = playerRuntime.position;
  const out = stepBossAi(v.ai, boss, def.boss, {
    dt,
    player: { x: player.x, z: player.z, alive },
    hpRatio: enemy ? enemy.hp / def.maxHp : 1,
    random: Math.random,
    force: bossDebugState.force ?? undefined,
  });
  if (bossDebugState.force && boss.state === bossDebugState.force) bossDebugState.force = null;
  patchHud({ phase: boss.phase, state: boss.state });
  if (out.phaseChanged) useUiStore.getState().pushToast({ textKey: 'boss.phase2' });
  if (out.strike) {
    strikeEffects(out.strike);
    if (alive && combatRuntime.invulnerable <= 0 && bossStrikeHits(out.strike, player)) authority.send({ type: 'EnemyStrike', enemyId: id, move: out.strike.move });
  }
}

const SPIKE_COLOR = [0.62, 0.86, 0.5] as const;
const SPORE_COLOR = [0.8, 0.74, 0.95] as const;

function strikeEffects(strike: BossStrike): void {
  const shake = (amount: number) => {
    if (useSettingsStore.getState().cameraShake) cameraRuntime.shake = Math.max(cameraRuntime.shake, amount);
  };
  switch (strike.move) {
    case 'spikes':
      for (const p of strike.points) {
        const y = terrainHeight(p.x, p.z);
        vfx({ type: 'burst', preset: 'meteorHit', x: p.x, y, z: p.z, color: SPIKE_COLOR, scale: 0.7 });
      }
      shake(0.12);
      break;
    case 'slam': {
      const y = terrainHeight(strike.x, strike.z);
      vfx({ type: 'shockwave', x: strike.x, y: y + 0.1, z: strike.z, radius: strike.radius + 0.5, duration: 0.55, color: [0.75, 0.68, 0.5] });
      vfx({ type: 'burst', preset: 'meteorHit', x: strike.x, y, z: strike.z, color: [0.7, 0.62, 0.48], scale: 1.4 });
      shake(0.35);
      break;
    }
    case 'spores': {
      // 沿著吹出的方向散開幾團孢子
      for (let i = 1; i <= 3; i++) {
        const d = (strike.range / 3) * i;
        const x = strike.x + Math.sin(strike.yaw) * d;
        const z = strike.z + Math.cos(strike.yaw) * d;
        vfx({ type: 'burst', preset: 'purify', x, y: terrainHeight(x, z) + 1.2, z, color: SPORE_COLOR, scale: 0.8 + i * 0.3 });
      }
      break;
    }
  }
}

function hudFor(enemyId: string, def: EnemyDef & { boss: BossDef }): BossHud {
  const state = authority.getState();
  const enemy = state.enemies.get(enemyId);
  return {
    enemyId,
    bossId: def.id,
    hp: enemy?.hp ?? def.maxHp,
    maxHp: def.maxHp,
    filled: filledTroughs(state, def.boss),
    total: def.boss.troughs.length,
    phase: 1,
    state: 'intro',
  };
}

/** 依權威層事件更新 HUD 與提示。只在啟動時安裝一次。 */
export function installBossRuntime(): void {
  let shieldedToastAt = -Infinity;
  authority.subscribe((events, state) => {
    if (events.length === 0) {
      // 讀檔 / 新遊戲：存檔不保留打到一半的頭目
      useBossStore.setState({ hud: null });
      return;
    }
    const ui = useUiStore.getState();
    const playerDefeated = events.some((e) => e.type === 'PlayerDefeated');
    for (const e of events) {
      switch (e.type) {
        case 'EnemySpawned': {
          const def = bosses.find((b) => b.id === e.kind);
          if (!def) break;
          useBossStore.setState({ hud: hudFor(e.enemyId, def) });
          // 戰前芽芽（Bible §6.5）；還沒有夥伴時改用提示
          if (state.companion.unlocked) companionSay('boss.intro');
          else ui.pushToast({ textKey: 'boss.intro' });
          break;
        }
        case 'EnemyDamaged': {
          const hud = useBossStore.getState().hud;
          if (hud?.enemyId !== e.enemyId) break;
          patchHud({ hp: e.hp });
          // 打到剩 1 點還有迷霧護著：提醒先去引水（不要一直跳）
          if (e.hp === 1 && hud.filled < hud.total && state.time - shieldedToastAt > 6) {
            shieldedToastAt = state.time;
            ui.pushToast({ textKey: 'boss.shielded' });
          }
          break;
        }
        case 'ObjectActivated': {
          if (resonanceRestored(e.placementId, state.companion.unlocked)) break;
          const def = bosses.find((b) => b.boss.troughs.includes(e.placementId));
          if (!def) break;
          const filled = filledTroughs(state, def.boss);
          patchHud({ filled });
          ui.pushToast({ textKey: filled >= def.boss.troughs.length ? 'boss.cleared' : 'boss.trough', vars: { filled, total: def.boss.troughs.length } });
          const v = enemyRuntime.get(useBossStore.getState().hud?.enemyId ?? '');
          if (v) vfx({ type: 'burst', preset: 'purify', x: v.ai.x, y: terrainHeight(v.ai.x, v.ai.z) + 3, z: v.ai.z, color: [0.62, 0.9, 1], scale: 2 });
          break;
        }
        case 'BossDefeated':
          ui.pushToast({ textKey: 'boss.defeated' });
          useBossStore.setState({ hud: null });
          break;
        case 'EnemyDespawned':
          if (useBossStore.getState().hud?.enemyId !== e.enemyId) break;
          useBossStore.setState({ hud: null });
          if (playerDefeated) ui.pushToast({ textKey: 'boss.retry' });
          break;
      }
    }
  });
}

/**
 * 戰後啟動的機關（任務 8D-2 森林根源石）：芽之共鳴回來了——綠光從石頭擴散、芽芽說話。
 * 不是這種機關時回傳 false。
 */
function resonanceRestored(placementId: string, companionUnlocked: boolean): boolean {
  const placement = worldIndex.placement(placementId);
  const prefab = placement && worldIndex.prefab(placement.prefabId);
  if (!placement || !prefab?.activate?.afterBoss) return false;
  const [x, , z] = placement.position;
  const y = terrainHeight(x, z);
  const mint = [0.55, 0.95, 0.75] as const;
  vfx({ type: 'flash', x, y: y + 1.6, z, color: mint, intensity: 6, duration: 1.4, distance: 22 });
  vfx({ type: 'shockwave', x, y: y + 0.15, z, radius: 16, duration: 1.6, color: mint });
  vfx({ type: 'burst', preset: 'purify', x, y: y + 1.4, z, color: mint, scale: 2.4 });
  useUiStore.getState().pushToast({ textKey: 'toast.resonance' });
  if (companionUnlocked) companionSay('companion.resonance');
  return true;
}

/** 除錯與測試：下一招指定為某一招（出招後清除） */
export const bossDebugState = { force: null as BossMoveId | null };

/** 除錯與測試：目前頭目戰的狀態 */
export function bossDebug(): (BossHud & { x: number; z: number; markers: { x: number; z: number }[]; slamTo: { x: number; z: number } | null; name: string }) | null {
  const hud = useBossStore.getState().hud;
  const v = hud && enemyRuntime.get(hud.enemyId);
  if (!hud || !v?.boss) return null;
  return {
    ...hud,
    x: v.ai.x,
    z: v.ai.z,
    markers: v.boss.state === 'spikes' ? v.boss.markers.map((m) => ({ ...m })) : [],
    slamTo: v.boss.state === 'slam' || v.boss.state === 'air' ? { ...v.boss.slamTo } : null,
    name: t(combat.enemies.get(hud.bossId)?.nameKey ?? hud.bossId),
  };
}
