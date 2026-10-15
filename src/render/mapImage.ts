// 世界地圖與小地圖的底圖（任務 7B，Bible §31.3）：由地形取樣格與世界物件畫出手繪風的俯視地圖。
// 只在第一次開啟地圖或顯示小地圖時畫一次（約數十毫秒），之後重複使用同一張 canvas。
import { CHANNEL_WATER_LEVEL, TRAIL_HALF_WIDTH } from '@/game-core/world/glowmossTerrain';
import { MEADOW_TRAIL_HALF_WIDTH } from '@/game-core/world/meadowTerrain';
import { MIRRORLAKE_TRAIL_HALF_WIDTH } from '@/game-core/world/mirrorlakeTerrain';
import { isOnMapTerrain, MAPS, type MapId } from '@/game-core/world/maps';
import { PATH_HALF_WIDTH, TERRAIN_SIZE, WATER_LEVEL } from '@/game-core/world/terrain';
import { getTerrainGrid, sampleGrid } from '@/game-core/world/terrainGrid';
import type { Placement, Prefab } from '@/game-core/world/types';
import type { WorldData } from '@/game-core/world/worldData';

/** 底圖解析度：每公尺 2 像素 */
export const MAP_PX_PER_M = 2;
export const MAP_SIZE_PX = TERRAIN_SIZE * MAP_PX_PER_M;

/** 世界座標 → 底圖像素（每張地圖一張底圖，以地圖原點為中心） */
export function worldToMap(x: number, z: number, map: MapId = 'dawnvale'): { u: number; v: number } {
  const o = MAPS[map].origin;
  return { u: (x - o.x + TERRAIN_SIZE / 2) * MAP_PX_PER_M, v: (z - o.z + TERRAIN_SIZE / 2) * MAP_PX_PER_M };
}

type Rgb = [number, number, number];
const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
type MapStyle = {
  grassLow: Rgb;
  grassHigh: Rgb;
  rock: Rgb;
  sand: Rgb;
  shallow: Rgb;
  deep: Rgb;
  road: Rgb;
  roadEdge: Rgb;
  contour: Rgb;
  /** 低於這個高度畫成水面（null：沒有水，例如乾涸的渠道） */
  water: number | null;
  /** 水邊（沙岸 / 乾涸渠道的泥面）的高度 */
  shore: number;
  roadHalf: number;
};
const STYLES: Readonly<Record<MapId, MapStyle>> = {
  dawnvale: {
    grassLow: hex('#9fcf6a'),
    grassHigh: hex('#c9dc8a'),
    rock: hex('#a89f8c'),
    sand: hex('#ecd9a0'),
    shallow: hex('#8fd3e0'),
    deep: hex('#4f9ec6'),
    road: hex('#d9b77e'),
    roadEdge: hex('#b8925a'),
    contour: hex('#6f8f4a'),
    water: WATER_LEVEL,
    shore: WATER_LEVEL,
    roadHalf: PATH_HALF_WIDTH,
  },
  // 螢苔祕林：深林綠、林間小徑、乾涸的渠道畫成泥色
  glowmoss: {
    grassLow: hex('#5f9a6a'),
    grassHigh: hex('#8fbf8a'),
    rock: hex('#8f938a'),
    sand: hex('#b49c78'),
    shallow: hex('#8fd3e0'),
    deep: hex('#4f9ec6'),
    road: hex('#c7a978'),
    roadEdge: hex('#97764c'),
    contour: hex('#3f6a48'),
    water: null,
    shore: CHANNEL_WATER_LEVEL - 0.4,
    roadHalf: TRAIL_HALF_WIDTH,
  },
  // 澄鏡湖：大片湖水藍，沙岸與水草綠的草坡
  mirrorlake: {
    grassLow: hex('#9fcf9a'),
    grassHigh: hex('#c4dfa8'),
    rock: hex('#a9aca4'),
    sand: hex('#efe0b0'),
    shallow: hex('#9edcea'),
    deep: hex('#4f9ec6'),
    road: hex('#dcc08e'),
    roadEdge: hex('#b39565'),
    contour: hex('#5f8f72'),
    water: WATER_LEVEL,
    shore: WATER_LEVEL,
    roadHalf: MIRRORLAKE_TRAIL_HALF_WIDTH,
  },
  // 風語草原：明亮的嫩草綠與金黃的丘頂
  whispermeadow: {
    grassLow: hex('#b3dc7c'),
    grassHigh: hex('#e2e09a'),
    rock: hex('#b5aa96'),
    sand: hex('#efe0b0'),
    shallow: hex('#9edcea'),
    deep: hex('#4f9ec6'),
    road: hex('#dcc08e'),
    roadEdge: hex('#b39565'),
    contour: hex('#7f9f52'),
    water: null,
    shore: WATER_LEVEL - 2,
    roadHalf: MEADOW_TRAIL_HALF_WIDTH,
  },
};

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** 物件在地圖上的畫法：樹（綠點）、岩石（灰點）、建築（屋頂色塊）；其餘不畫 */
export type MapGlyph = 'tree' | 'rock' | 'building' | null;

export function glyphFor(prefab: Prefab): MapGlyph {
  const id = prefab.id;
  if (prefab.harvest?.lootTableId === 'wood_basic' || /tree|pine|oak/.test(id)) return 'tree';
  if (prefab.harvest?.lootTableId === 'stone_basic' || /rock|boulder|stone_tall/.test(id)) return 'rock';
  if (/house|tavern|windmill|watermill|lumbermill|blacksmith|market|lighthouse|well|cottage|tent/.test(id)) return 'building';
  return null;
}

/** 依地形與物件畫出底圖（不含探索霧罩與標記） */
export function paintMapBase(data: WorldData, map: MapId = 'dawnvale', canvas: HTMLCanvasElement = document.createElement('canvas')): HTMLCanvasElement {
  const C = STYLES[map];
  const origin = MAPS[map].origin;
  canvas.width = MAP_SIZE_PX;
  canvas.height = MAP_SIZE_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('無法建立地圖畫布');
  const grid = getTerrainGrid(map);
  const img = ctx.createImageData(MAP_SIZE_PX, MAP_SIZE_PX);
  const half = TERRAIN_SIZE / 2;
  const step = 1 / MAP_PX_PER_M;
  for (let py = 0; py < MAP_SIZE_PX; py++) {
    const z = origin.z - half + (py + 0.5) * step;
    for (let px = 0; px < MAP_SIZE_PX; px++) {
      const x = origin.x - half + (px + 0.5) * step;
      const h = sampleGrid(grid, grid.height, x, z);
      const hx = sampleGrid(grid, grid.height, x + 0.5, z) - sampleGrid(grid, grid.height, x - 0.5, z);
      const hz = sampleGrid(grid, grid.height, x, z + 0.5) - sampleGrid(grid, grid.height, x, z - 0.5);
      let col: Rgb;
      if (C.water !== null && h < C.water) {
        col = mix(C.shallow, C.deep, clamp01((C.water - h) / 2.5));
      } else {
        // 高度越高越偏黃綠；陡坡露出岩石；水邊是沙岸
        col = mix(C.grassLow, C.grassHigh, clamp01((h - 1) / 14));
        const slope = Math.hypot(hx, hz);
        col = mix(col, C.rock, clamp01((slope - 0.55) * 2.2));
        col = mix(col, C.sand, clamp01(1 - (h - C.shore) / 0.6));
        // 等高線：每 4 m 一條淡線（手繪地圖感）
        const contour = Math.abs((((h + 100) % 4) + 4) % 4 - 2);
        if (contour > 1.88 && slope < 0.9) col = mix(col, C.contour, 0.35);
        // 道路
        const d = sampleGrid(grid, grid.pathDist, x, z);
        if (d < C.roadHalf * 1.05) col = mix(C.roadEdge, C.road, clamp01((C.roadHalf * 1.05 - d) / 0.6));
        // 山影：西北方向受光
        const shade = clamp01(1 - (hx * -0.7 + hz * -0.7) * 0.9);
        col = mix([col[0] * 0.72, col[1] * 0.72, col[2] * 0.78], col, shade);
      }
      const o = (py * MAP_SIZE_PX + px) * 4;
      img.data[o] = col[0];
      img.data[o + 1] = col[1];
      img.data[o + 2] = col[2];
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  drawObjects(ctx, data, map);
  return canvas;
}

function drawObjects(ctx: CanvasRenderingContext2D, data: WorldData, map: MapId): void {
  const glyphs: { p: Placement; glyph: Exclude<MapGlyph, null> }[] = [];
  for (const p of data.placements) {
    if (!isOnMapTerrain(MAPS[map], p.position[0], p.position[2])) continue; // 其他地圖與室內子場景
    const prefab = data.prefabs.get(p.prefabId);
    const glyph = prefab ? glyphFor(prefab) : null;
    if (glyph) glyphs.push({ p, glyph });
  }
  // 先畫樹影、樹冠，再畫岩石與建築（建築永遠在最上層）
  const order: Exclude<MapGlyph, null>[] = ['tree', 'rock', 'building'];
  for (const kind of order) {
    for (const { p, glyph } of glyphs) {
      if (glyph !== kind) continue;
      const { u, v } = worldToMap(p.position[0], p.position[2], map);
      const s = p.scale?.[0] ?? 1;
      if (glyph === 'tree') {
        const r = Math.max(2.2, Math.min(6, s * 0.55)) * (MAP_PX_PER_M / 2);
        ctx.fillStyle = 'rgba(40, 70, 30, 0.35)';
        ctx.beginPath();
        ctx.arc(u + 1.2, v + 1.2, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = p.prefabId.includes('fall') ? '#d98a3a' : p.prefabId.includes('pine') || p.prefabId.includes('cone') || p.prefabId.includes('dark') || p.prefabId.includes('tall') ? '#3f7f45' : '#5b9b45';
        ctx.beginPath();
        ctx.arc(u, v, r, 0, Math.PI * 2);
        ctx.fill();
      } else if (glyph === 'rock') {
        ctx.fillStyle = '#8d877c';
        ctx.beginPath();
        ctx.arc(u, v, Math.max(1.6, Math.min(4, s * 0.25)), 0, Math.PI * 2);
        ctx.fill();
      } else {
        const size = Math.max(5, Math.min(18, s * 1.6)) * (MAP_PX_PER_M / 2);
        ctx.save();
        ctx.translate(u, v);
        ctx.rotate(-(p.rotation?.[1] ?? 0));
        ctx.fillStyle = 'rgba(60, 40, 20, 0.35)';
        ctx.fillRect(-size / 2 + 1.5, -size / 2 + 1.5, size, size);
        ctx.fillStyle = p.prefabId.includes('blue') ? '#5b86c9' : p.prefabId.includes('yellow') ? '#e2b24a' : p.prefabId.includes('green') || p.prefabId === 'tavern' ? '#5fa067' : '#c7574a';
        ctx.fillRect(-size / 2, -size / 2, size, size);
        ctx.strokeStyle = '#5a3a22';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(-size / 2, -size / 2, size, size);
        ctx.restore();
      }
    }
  }
}

const cachedBase = new Map<MapId, HTMLCanvasElement>();

/** 共用的底圖（每張地圖第一次呼叫時畫） */
export function getMapBase(data: WorldData, map: MapId = 'dawnvale'): HTMLCanvasElement {
  let base = cachedBase.get(map);
  if (!base) {
    base = paintMapBase(data, map);
    cachedBase.set(map, base);
  }
  return base;
}
