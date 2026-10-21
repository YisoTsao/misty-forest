// 世界地圖與小地圖共用的繪製（任務 7B）：底圖、地標、任務標記、NPC、寶箱、玩家箭頭。
// 地圖全開（使用者 2026-10-17）：不再畫探索霧罩，區域名稱、地標與寶箱不論是否走過都顯示；探索紀錄只用來算探索度。
// 只讀狀態（權威狀態、本機暫態），不修改任何東西；每次呼叫畫一整幀。
import type { GameState } from '@/game-core/authority/rules';
import { BUILD_AREA } from '@/game-core/build/build';
import { isOnMapTerrain, mapAt, mapIdAt, mapIds, MAPS, type MapId } from '@/game-core/world/maps';
import { landmarkShown, questMarkers, type LandmarkIcon, type QuestMarker } from '@/game-core/map/markers';
import { TERRAIN_SIZE } from '@/game-core/world/terrain';
import { combat, landmarks, npcs, quests, regions, worldIndex } from '@/game/authority';
import { enemyRuntime } from '@/game/combat/combatRuntime';
import { t } from '@/game/i18n';
import { npcRuntime, npcVisible } from '@/game/npc/npcRuntime';
import { worldDataResult } from '@/game/worldData';
import { MAP_PX_PER_M, MAP_SIZE_PX } from '@/render/mapImage';

/** 地圖畫面的視窗：中心（世界座標）與每公尺的螢幕像素；textScale 縮放地名與地標（手機版的全螢幕地圖用較小的字，預設 1） */
export type MapView = { cx: number; cz: number; pxPerM: number; width: number; height: number; textScale?: number };

export function worldToScreen(view: MapView, x: number, z: number): { sx: number; sy: number } {
  return { sx: view.width / 2 + (x - view.cx) * view.pxPerM, sy: view.height / 2 + (z - view.cz) * view.pxPerM };
}

/** 把底圖依視窗畫到畫面上 */
export function drawLayer(ctx: CanvasRenderingContext2D, layer: CanvasImageSource, view: MapView, map: MapId = 'dawnvale'): void {
  const scale = view.pxPerM / MAP_PX_PER_M;
  const o = MAPS[map].origin;
  const { sx, sy } = worldToScreen(view, o.x - TERRAIN_SIZE / 2, o.z - TERRAIN_SIZE / 2);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(layer, sx, sy, MAP_SIZE_PX * scale, MAP_SIZE_PX * scale);
}

const LANDMARK_EMOJI: Record<LandmarkIcon, string> = {
  village: '🏘️',
  tavern: '🍺',
  lighthouse: '🗼',
  windmill: '🌾',
  bridge: '🌉',
  mill: '⚙️',
  ruins: '🏛️',
  peak: '⛰️',
  camp: '⛺',
  home: '🏡',
  spawn: '✨',
  forest: '🌲',
  smith: '🔨',
  gate: '⛩️',
  moon: '🌙',
  stones: '🪨',
  mushroom: '🍄',
  maze: '🌿',
  water: '💧',
};

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color = '#3b2a17'): void {
  ctx.font = `bold ${size}px "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2, size / 4);
  ctx.strokeStyle = 'rgba(255, 250, 235, 0.92)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

let cachedRegionNames: Set<string> | null = null;
function regionNames(): Set<string> {
  cachedRegionNames ??= new Set(regions.map((r) => t(r.nameKey)));
  return cachedRegionNames;
}

/** 區域名稱（區域中心；範圍很小的家園不標，避免與湖重疊） */
export function drawRegionLabels(ctx: CanvasRenderingContext2D, view: MapView, map: MapId = 'dawnvale'): void {
  for (const r of regions) {
    if (!r.area || r.area.radius < 10) continue;
    const [x, z] = r.area.center;
    if (mapIdAt(x, z) !== map) continue;
    const { sx, sy } = worldToScreen(view, x, z);
    const k = view.textScale ?? 1;
    label(ctx, t(r.nameKey), sx, sy - 18 * k, Math.max(12, Math.min(18, view.pxPerM * 7)) * k, '#5a3d1e');
  }
}

/** 地標圖示與名稱 */
export function drawLandmarks(ctx: CanvasRenderingContext2D, view: MapView, state: Pick<GameState, 'quests'>, withNames: boolean, map: MapId = 'dawnvale'): void {
  const k = view.textScale ?? 1;
  const size = Math.max(14, Math.min(24, view.pxPerM * 9)) * k;
  for (const l of landmarks) {
    if (mapIdAt(l.position[0], l.position[1]) !== map || !landmarkShown(l, state.quests)) continue;
    const { sx, sy } = worldToScreen(view, l.position[0], l.position[1]);
    ctx.fillStyle = 'rgba(255, 248, 225, 0.92)';
    ctx.strokeStyle = '#8a6a3a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(sx, sy, size * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(LANDMARK_EMOJI[l.icon], sx, sy + 1);
    // 與區域同名的地標（農田、遺跡、望星丘…）已有區域標籤，不重複寫名字
    if (withNames && !regionNames().has(t(l.nameKey))) label(ctx, t(l.nameKey), sx, sy + size * 1.15, Math.max(11 * k, size * 0.62));
  }
}

/** 還沒打開的寶箱 */
export function drawChests(ctx: CanvasRenderingContext2D, view: MapView, state: GameState): void {
  if (!worldDataResult.ok) return;
  const s = Math.max(5, Math.min(9, view.pxPerM * 3));
  for (const p of worldDataResult.data.placements) {
    if (worldDataResult.data.prefabs.get(p.prefabId)?.entity !== 'chest') continue;
    const [x, , z] = p.position;
    if (!isOnMapTerrain(mapAt(x, z), x, z)) continue; // 室內子場景
    if (state.objects.get(p.id)?.open) continue;
    const { sx, sy } = worldToScreen(view, x, z);
    ctx.fillStyle = '#c98a2c';
    ctx.strokeStyle = '#5a3a14';
    ctx.lineWidth = 1.5;
    ctx.fillRect(sx - s, sy - s * 0.7, s * 2, s * 1.4);
    ctx.strokeRect(sx - s, sy - s * 0.7, s * 2, s * 1.4);
    ctx.fillStyle = '#ffe48a';
    ctx.fillRect(sx - 1.5, sy - s * 0.3, 3, s * 0.6);
  }
}

/** 在某張地圖的地形上（不是室內子場景）；螢苔祕林的 NPC 也要畫（原本只看晨曦谷地的範圍） */
function onSomeMap(x: number, z: number): boolean {
  return mapIds.some((id) => isOnMapTerrain(MAPS[id], x, z));
}

/** NPC：綠色圓點與名字 */
export function drawNpcs(ctx: CanvasRenderingContext2D, view: MapView, withNames: boolean): void {
  for (const n of npcs) {
    if (!npcVisible(n)) continue;
    const r = npcRuntime.get(n.id);
    if (!r || !onSomeMap(r.x, r.z)) continue; // 室內的 NPC 不畫
    const { sx, sy } = worldToScreen(view, r.x, r.z);
    ctx.fillStyle = '#3fae5a';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (withNames) label(ctx, t(n.nameKey), sx, sy - 12, 12, '#1f5a2e');
  }
}

/** 敵人：紅點（小地圖只畫附近的） */
export function drawEnemies(ctx: CanvasRenderingContext2D, view: MapView, maxDist: number, from: { x: number; z: number }): void {
  ctx.fillStyle = '#e04848';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  for (const v of enemyRuntime.values()) {
    if (v.vanishing !== null) continue;
    if (Math.hypot(v.ai.x - from.x, v.ai.z - from.z) > maxDist) continue;
    const { sx, sy } = worldToScreen(view, v.ai.x, v.ai.z);
    ctx.beginPath();
    ctx.arc(sx, sy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

/** 目前的任務標記 */
export function currentQuestMarkers(state: GameState): QuestMarker[] {
  return questMarkers(state, quests, {
    npcPosition: (id) => {
      const r = npcRuntime.get(id);
      const def = npcs.find((n) => n.id === id);
      if (def && !npcVisible(def, state)) return null;
      if (r && onSomeMap(r.x, r.z)) return { x: r.x, z: r.z };
      return def && onSomeMap(def.position[0], def.position[1]) ? { x: def.position[0], z: def.position[1] } : null;
    },
    placement: (id) => worldIndex.placement(id),
    spawners: combat.spawners,
    buildArea: BUILD_AREA,
  });
}

/** 任務標記：「!」可接、「?」可回報、金色圓圈為目標區域；clampRadius 指定時，範圍外的標記夾到圓形邊緣 */
export function drawQuestMarkers(
  ctx: CanvasRenderingContext2D,
  view: MapView,
  markers: readonly QuestMarker[],
  clampRadius?: number,
): void {
  for (const m of markers) {
    let { sx, sy } = worldToScreen(view, m.x, m.z);
    let clamped = false;
    if (clampRadius !== undefined) {
      const dx = sx - view.width / 2;
      const dy = sy - view.height / 2;
      const d = Math.hypot(dx, dy);
      if (d > clampRadius) {
        sx = view.width / 2 + (dx / d) * clampRadius;
        sy = view.height / 2 + (dy / d) * clampRadius;
        clamped = true;
      }
    }
    if (m.kind === 'objective' && m.radius && !clamped) {
      ctx.fillStyle = 'rgba(255, 200, 60, 0.22)';
      ctx.strokeStyle = 'rgba(214, 150, 20, 0.9)';
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, m.radius * view.pxPerM, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const r = clamped ? 8 : 10;
    ctx.fillStyle = m.kind === 'objective' ? '#f2b630' : m.kind === 'turnIn' ? '#4fb3e8' : '#f2b630';
    ctx.strokeStyle = '#5a3a0a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${r * 1.5}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(m.kind === 'available' ? '!' : m.kind === 'turnIn' ? '?' : '★', sx, sy + 1);
  }
}

/** 玩家：白邊的箭頭，指向面向；cameraYaw 指定時另畫視野扇形 */
export function drawPlayer(ctx: CanvasRenderingContext2D, sx: number, sy: number, facingYaw: number, cameraYaw?: number): void {
  if (cameraYaw !== undefined) {
    // 攝影機看向 -（sin yaw, cos yaw）方向（攝影機在角色後方）
    const look = Math.atan2(-Math.cos(cameraYaw), -Math.sin(cameraYaw));
    const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, 46);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.arc(sx, sy, 46, look - 0.55, look + 0.55);
    ctx.closePath();
    ctx.fill();
  }
  ctx.save();
  ctx.translate(sx, sy);
  // 面向 yaw：0 為 +Z（地圖往下），畫面上的角度 = atan2(cos, sin)
  ctx.rotate(Math.atan2(Math.cos(facingYaw), Math.sin(facingYaw)));
  ctx.fillStyle = '#ff6a3d';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(11, 0);
  ctx.lineTo(-7, 7);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-7, -7);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}
