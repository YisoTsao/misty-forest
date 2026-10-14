// 世界地圖與小地圖共用的繪製（任務 7B）：底圖、探索霧罩、地標、任務標記、NPC、寶箱、玩家箭頭。
// 只讀狀態（權威狀態、本機暫態），不修改任何東西；每次呼叫畫一整幀。
import type { GameState } from '@/game-core/authority/rules';
import { EXPLORE_CELL, EXPLORE_GRID, isCellExplored, isExploredAt, mapCellOffset, type Explored } from '@/game-core/map/explore';
import { isOnMapTerrain, mapAt, mapIdAt, MAPS, type MapId } from '@/game-core/world/maps';
import { questMarkers, type LandmarkIcon, type QuestMarker } from '@/game-core/map/markers';
import { TERRAIN_SIZE } from '@/game-core/world/terrain';
import { combat, landmarks, npcs, quests, regions, worldIndex } from '@/game/authority';
import { enemyRuntime } from '@/game/combat/combatRuntime';
import { t } from '@/game/i18n';
import { npcRuntime } from '@/game/npc/npcRuntime';
import { worldDataResult } from '@/game/worldData';
import { MAP_PX_PER_M, MAP_SIZE_PX } from '@/render/mapImage';

/** 地圖畫面的視窗：中心（世界座標）與每公尺的螢幕像素 */
export type MapView = { cx: number; cz: number; pxPerM: number; width: number; height: number };

export function worldToScreen(view: MapView, x: number, z: number): { sx: number; sy: number } {
  return { sx: view.width / 2 + (x - view.cx) * view.pxPerM, sy: view.height / 2 + (z - view.cz) * view.pxPerM };
}

/** 未探索區域的霧罩：已探索的格子挖空，邊緣模糊（低細節霧罩，不是全黑，Bible §31.3） */
export function paintFog(explored: Explored, map: MapId = 'dawnvale', canvas: HTMLCanvasElement = document.createElement('canvas')): HTMLCanvasElement {
  const offset = mapCellOffset(map);
  canvas.width = MAP_SIZE_PX;
  canvas.height = MAP_SIZE_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.clearRect(0, 0, MAP_SIZE_PX, MAP_SIZE_PX);
  // 霧：淡紫灰底色 ＋ 雲紋
  ctx.fillStyle = 'rgba(214, 214, 226, 0.9)';
  ctx.fillRect(0, 0, MAP_SIZE_PX, MAP_SIZE_PX);
  ctx.fillStyle = 'rgba(190, 194, 214, 0.55)';
  for (let i = 0; i < 160; i++) {
    const u = ((i * 97) % 160) / 160;
    const v = ((i * 61 + 13) % 157) / 157;
    ctx.beginPath();
    ctx.arc(u * MAP_SIZE_PX, v * MAP_SIZE_PX, 14 + ((i * 7) % 22), 0, Math.PI * 2);
    ctx.fill();
  }
  // 挖空已探索的格子（模糊邊緣）。所有格子合成一條路徑只填一次：帶 filter 的每次繪製都是一次 GPU 模糊，
  // 逐格 fillRect 會讓重畫的成本隨探索格數增加（跑遠後每進一格卡 100 ms 以上）
  const holes = new Path2D();
  const cell = EXPLORE_CELL * MAP_PX_PER_M;
  for (let j = 0; j < EXPLORE_GRID; j++) {
    for (let i = 0; i < EXPLORE_GRID; i++) {
      if (!isCellExplored(explored, offset + j * EXPLORE_GRID + i)) continue;
      holes.rect(i * cell - 3, j * cell - 3, cell + 6, cell + 6);
    }
  }
  ctx.globalCompositeOperation = 'destination-out';
  ctx.filter = 'blur(10px)';
  ctx.fillStyle = '#000';
  // 相鄰格子的矩形互相重疊，nonzero 會把聯集整個填滿
  ctx.fill(holes);
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}

/** 把底圖（或霧罩）依視窗畫到畫面上 */
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

/** 區域名稱（已探索的區域中心；範圍很小的家園不標，避免與湖重疊） */
export function drawRegionLabels(ctx: CanvasRenderingContext2D, view: MapView, explored: Explored, map: MapId = 'dawnvale'): void {
  for (const r of regions) {
    if (!r.area || r.area.radius < 10) continue;
    const [x, z] = r.area.center;
    if (mapIdAt(x, z) !== map) continue;
    if (!isExploredAt(explored, x, z)) continue;
    const { sx, sy } = worldToScreen(view, x, z);
    label(ctx, t(r.nameKey), sx, sy - 18, Math.max(12, Math.min(18, view.pxPerM * 7)), '#5a3d1e');
  }
}

/** 地標圖示與名稱（已探索的地標） */
export function drawLandmarks(ctx: CanvasRenderingContext2D, view: MapView, explored: Explored, withNames: boolean, map: MapId = 'dawnvale'): void {
  const size = Math.max(14, Math.min(24, view.pxPerM * 9));
  for (const l of landmarks) {
    if (mapIdAt(l.position[0], l.position[1]) !== map) continue;
    if (!isExploredAt(explored, l.position[0], l.position[1])) continue;
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
    if (withNames && !regionNames().has(t(l.nameKey))) label(ctx, t(l.nameKey), sx, sy + size * 1.15, Math.max(11, size * 0.62));
  }
}

/** 還沒打開、在已探索範圍內的寶箱 */
export function drawChests(ctx: CanvasRenderingContext2D, view: MapView, state: GameState): void {
  if (!worldDataResult.ok) return;
  const s = Math.max(5, Math.min(9, view.pxPerM * 3));
  for (const p of worldDataResult.data.placements) {
    if (worldDataResult.data.prefabs.get(p.prefabId)?.entity !== 'chest') continue;
    const [x, , z] = p.position;
    if (!isOnMapTerrain(mapAt(x, z), x, z)) continue; // 室內子場景
    if (state.objects.get(p.id)?.open || !isExploredAt(state.explored, x, z)) continue;
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

/** NPC：綠色圓點與名字 */
export function drawNpcs(ctx: CanvasRenderingContext2D, view: MapView, withNames: boolean): void {
  for (const n of npcs) {
    const r = npcRuntime.get(n.id);
    if (!r || Math.abs(r.x) > TERRAIN_SIZE / 2) continue; // 室內的 NPC 不畫
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
      if (r && Math.abs(r.x) <= TERRAIN_SIZE / 2) return { x: r.x, z: r.z };
      const def = npcs.find((n) => n.id === id);
      return def && Math.abs(def.position[0]) <= TERRAIN_SIZE / 2 ? { x: def.position[0], z: def.position[1] } : null;
    },
    placement: (id) => worldIndex.placement(id),
    spawners: combat.spawners,
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
