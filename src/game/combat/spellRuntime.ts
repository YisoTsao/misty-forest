// 魔法的本機暫態（GAME_DESIGN 5.4）：冷卻、施法中的進度、飛行中的彈體。星光值（MP）是權威狀態。
// 也負責「被魔法擊敗的迷霧生物散成金色光點」（淨化）：監聽權威事件，送出特效請求。
import type { SpellDef } from '@/game-core/combat/spells';
import { terrainHeight } from '@/game-core/world/terrain';
import { authority } from '../authority';
import { projectileVisuals, vfx } from '../vfx/vfxQueue';
import { enemyRuntime } from './combatRuntime';

export type Projectile = {
  id: number;
  spell: SpellDef;
  x: number;
  y: number;
  z: number;
  yaw: number;
  traveled: number;
  /** 追蹤的敵人 id（null 表示直飛） */
  target: string | null;
  /** 其他玩家施放的（任務 11E）：只畫出來，不命中本機的敵人 */
  visualOnly?: boolean;
};

export type MeteorDrop = {
  /** 落點 */
  x: number;
  z: number;
  /** 距離開始落下的時間（秒，負值表示還沒開始） */
  age: number;
  /** 是否為最後一顆（範圍較大、光爆） */
  final: boolean;
  spell: SpellDef;
  id: number;
  /** 其他玩家施放的（任務 11E）：只畫出來，不命中本機的敵人 */
  visualOnly?: boolean;
};

export const spellRuntime = {
  /** 法術 id → 剩餘冷卻（秒） */
  cooldowns: new Map<string, number>(),
  /** 施法中：蓄力（魔法陣）→ 發動；target 為流星雨的落點中心 */
  casting: null as { spell: SpellDef; elapsed: number; released: boolean; target?: { x: number; z: number } } | null,
  projectiles: [] as Projectile[],
  meteors: [] as MeteorDrop[],
  nextId: 1,
  /** 上次提示「星光不足」的時間（避免連按時一直跳） */
  noMpToastAt: -Infinity,
  /** 累計：發動次數與命中次數（除錯與測試用） */
  casts: 0,
  hits: 0,
};

export function cooldownOf(spellId: string): number {
  return spellRuntime.cooldowns.get(spellId) ?? 0;
}

export function resetSpells(): void {
  spellRuntime.cooldowns.clear();
  spellRuntime.casting = null;
  spellRuntime.projectiles.length = 0;
  spellRuntime.meteors.length = 0;
  projectileVisuals.clear();
}

/** 啟動時安裝一次：被法術擊敗的迷霧生物 → 淨化特效（金色光點上升） */
export function installSpellEffects(): void {
  authority.subscribe((events) => {
    if (events.length === 0) {
      // 新遊戲 / 讀檔：清掉施法中的狀態與彈體
      resetSpells();
      return;
    }
    const bySpell = new Set<string>();
    for (const e of events) {
      if (e.type === 'EnemyDamaged' && e.attack.startsWith('spell_')) bySpell.add(e.enemyId);
      if (e.type === 'EnemyDefeated' && bySpell.has(e.enemyId)) {
        const v = enemyRuntime.get(e.enemyId);
        if (!v) continue;
        const y = terrainHeight(v.ai.x, v.ai.z);
        vfx({ type: 'burst', preset: 'purify', x: v.ai.x, y, z: v.ai.z, color: [2.4, 1.9, 0.8] });
      }
    }
  });
}
