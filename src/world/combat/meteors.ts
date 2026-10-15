// 流星雨（GAME_DESIGN 5.4、任務 6E）的本機模擬：落點計畫由 game-core 決定（meteorPlan），
// 這裡依時間推進每顆流星：從天空斜落 → 撞擊時以範圍判定命中、送出攻擊指令、播放撞擊特效。
import type { SpellDef } from '@/game-core/combat/spells';
import { isInBlast, meteorPlan } from '@/game-core/combat/spells';
import { clampInsideMap } from '@/game-core/world/maps';
import { terrainHeight } from '@/game-core/world/terrain';
import { audio } from '@/game/audio/audioEngine';
import { attackEnemy, enemyHitRadius, enemyRuntime } from '@/game/combat/combatRuntime';
import { spellRuntime } from '@/game/combat/spellRuntime';
import { cameraRuntime } from '@/game/player/localRuntime';
import { useSettingsStore } from '@/game/state/settingsStore';
import { projectileVisuals, vfx, type Rgb } from '@/game/vfx/vfxQueue';

/** 敵人身體半徑（命中判定用） */
/** 流星從撞擊點的這個相對位置開始落下（斜斜地從天空劃過） */
const FALL_FROM = { x: 7, y: 26, z: -5 } as const;

/** 流星雨的落點中心：玩家前方 distance 公尺，拉回地圖邊界內 */
export function meteorCenter(spell: SpellDef, player: { x: number; z: number; facingYaw: number }): { x: number; z: number } {
  const distance = spell.meteor?.distance ?? 6;
  const x = player.x + Math.sin(player.facingYaw) * distance;
  const z = player.z + Math.cos(player.facingYaw) * distance;
  return clampInsideMap(x, z, 2);
}

/** 發動：依計畫排入每顆流星（第一顆在 0 秒開始落下）。visualOnly：其他玩家施放的，只畫出來（任務 11E） */
export function launchMeteors(spell: SpellDef, center: { x: number; z: number }, visualOnly = false): void {
  for (const { delay, ...drop } of meteorPlan(spell, center, Math.random)) {
    spellRuntime.meteors.push({ ...drop, age: -delay, spell, id: spellRuntime.nextId++, visualOnly });
  }
}

/** 每幀推進：落下中的流星畫出火光拖尾，撞擊時結算 */
export function updateMeteors(dt: number): void {
  const list = spellRuntime.meteors;
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i]!;
    const meteor = m.spell.meteor!;
    m.age += dt;
    if (m.age < 0) continue;
    const ground = terrainHeight(m.x, m.z);
    const t = Math.min(1, m.age / meteor.fallTime);
    if (t < 1) {
      // 加速落下（t²），越接近地面越快
      const k = 1 - t * t;
      projectileVisuals.set(m.id, {
        id: m.id,
        x: m.x + FALL_FROM.x * k,
        y: ground + 0.4 + FALL_FROM.y * k,
        z: m.z + FALL_FROM.z * k,
        color: m.spell.color as Rgb,
        size: m.final ? 1.2 : 0.8,
        trail: 2.2,
      });
      continue;
    }
    projectileVisuals.delete(m.id);
    list.splice(i, 1);
    impact(m.spell, m.x, ground, m.z, m.final, m.visualOnly === true);
  }
}

function impact(spell: SpellDef, x: number, y: number, z: number, final: boolean, visualOnly: boolean): void {
  const radius = final ? spell.radius : spell.meteor!.impactRadius;
  const color = spell.color as Rgb;
  vfx({ type: 'shockwave', x, y, z, radius: radius + 0.5, duration: final ? 0.75 : 0.45, color });
  vfx({ type: 'burst', preset: 'meteorHit', x, y, z, color, scale: final ? 1.5 : 0.8 });
  if (final) vfx({ type: 'flash', x, y: y + 1.5, z, color, intensity: 14, duration: 0.6, distance: radius * 3 });
  if (visualOnly) return;
  for (const [id, v] of enemyRuntime) {
    if (v.vanishing !== null) continue;
    if (isInBlast({ x, z }, radius, { x: v.ai.x, z: v.ai.z, radius: enemyHitRadius(v.kind) })) {
      attackEnemy(id, spell.id);
      spellRuntime.hits++;
    }
  }
  audio.play(final ? 'skill' : 'hit');
  if (useSettingsStore.getState().cameraShake) cameraRuntime.shake = Math.max(cameraRuntime.shake, final ? 0.3 : 0.1);
}
