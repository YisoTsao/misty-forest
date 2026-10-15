// 任務 9F：風語草原（Bible §8，地圖四）的 placement。由 gen-placements.ts 在澄鏡湖之後呼叫。
// 地圖在世界座標 MEADOW_ORIGIN（決策 T-117），這裡以局部座標配置後加上原點。
// 手動配置的地標（古風帆入口、風車聚落、浮石山脊、風向塔台地、競技場、彎月石拱）＋ 草原散佈 ＋ 邊界樹。
// 澄鏡湖這一側只加入東岸的古風帆。全部使用獨立的固定種子，結果可重現。
import { readFileSync } from 'node:fs';
import { mulberry32 } from '../src/game-core/util/random.ts';
import { boundaryDistance, boundaryOutline } from '../src/game-core/world/bounds.ts';
import {
  ARENA,
  CRESCENT_ARCH,
  HAMLET,
  MEADOW_ARRIVAL,
  MEADOW_ORIGIN,
  MEADOW_SIZE,
  MEADOW_TRAIL_HALF_WIDTH,
  meadowHeight,
  meadowPathDistance,
  plateauWeight,
  RIDGE,
  ridgeWeight,
  TOWER,
  WINDMILLS,
} from '../src/game-core/world/meadowTerrain.ts';
import { MIRRORLAKE_ORIGIN, mirrorlakeHeight } from '../src/game-core/world/mirrorlakeTerrain.ts';

type Out = {
  id: string;
  prefabId: string;
  regionId: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
};
type Taken = { x: number; z: number; r: number };

const round = (n: number) => Math.round(n * 100) / 100;
const pad2 = (n: number) => String(n).padStart(2, '0');
const pad3 = (n: number) => String(n).padStart(3, '0');
type RegionArea = { center: [number, number]; radius: number; blend: number };
const regions = JSON.parse(readFileSync('src/data/regions.json', 'utf8')) as { id: string; area?: RegionArea }[];

/** 與 game-core 的 regionAt 相同規則（權重最大、同權重取範圍較小者；預設為起伏草原）；世界座標 */
function regionAt(x: number, z: number): string {
  let best = 'windy_hills';
  let bestWeight = 0.5;
  let bestRadius = Infinity;
  for (const r of regions) {
    if (!r.area) continue;
    const { center, radius, blend } = r.area;
    const d = Math.hypot(x - center[0], z - center[1]);
    const t = Math.min(1, Math.max(0, (d - (radius - blend / 2)) / blend));
    const w = 1 - t * t * (3 - 2 * t);
    if (w > bestWeight + 1e-6 || (Math.abs(w - bestWeight) <= 1e-6 && radius < bestRadius)) {
      best = r.id;
      bestWeight = w;
      bestRadius = radius;
    }
  }
  return best;
}

const O = MEADOW_ORIGIN;
const height = meadowHeight;

function slopeAt(x: number, z: number): number {
  return Math.hypot(height(x + 0.6, z) - height(x - 0.6, z), height(x, z + 0.6) - height(x, z - 0.6)) / 1.2;
}

/** 澄鏡湖東岸的古風帆（局部座標，東岸小徑的盡頭） */
const LAKE_SAIL = { x: 128, z: -2 } as const;

export function addMeadow(placements: Out[]): void {
  const out: Out[] = [];
  const taken: Taken[] = [];
  const ids = new Set(placements.map((p) => p.id));
  const push = (o: Out) => {
    if (ids.has(o.id)) throw new Error(`placement id 重複：${o.id}`);
    ids.add(o.id);
    out.push(o);
  };
  /** 以局部座標放置（y 省略時貼地） */
  const place = (id: string, prefabId: string, x: number, z: number, o: { scale?: number; yaw?: number; dy?: number; r?: number; sy?: number } = {}) => {
    const s = o.scale ?? 1;
    push({
      id,
      prefabId,
      regionId: regionAt(x + O.x, z + O.z),
      position: [round(x + O.x), round(height(x, z) - 0.03 + (o.dy ?? 0)), round(z + O.z)],
      rotation: [0, round(o.yaw ?? 0), 0],
      scale: [s, round(s * (o.sy ?? 1)), s],
    });
    if (o.r) taken.push({ x, z, r: o.r });
  };

  // ── 1. 澄鏡湖這一側：東岸的古風帆（往東走進開闊的草原），移除與它重疊的散佈點綴 ──
  {
    const L = MIRRORLAKE_ORIGIN;
    const scatter = /^mirrorlake_(tree|bush|rock|shore_stone|reed|grass|edge_tree)_\d+$/;
    for (let i = placements.length - 1; i >= 0; i--) {
      const p = placements[i]!;
      if (scatter.test(p.id) && Math.hypot(p.position[0] - L.x - LAKE_SAIL.x, p.position[2] - L.z - LAKE_SAIL.z) < 6) placements.splice(i, 1);
    }
    push({
      id: 'mirrorlake_gate_meadow',
      prefabId: 'gate_to_meadow',
      regionId: 'lake_shore',
      position: [round(LAKE_SAIL.x + L.x), round(mirrorlakeHeight(LAKE_SAIL.x, LAKE_SAIL.z) - 0.05), round(LAKE_SAIL.z + L.z)],
      // 背對入口的方向是西（抵達澄鏡湖時面向西走回湖邊）
      rotation: [0, round(-Math.PI / 2), 0],
      scale: [1, 1, 1],
    });
  }

  // ── 2. 入口：西側的古風帆（回澄鏡湖）──
  place('meadow_gate_mirrorlake', 'gate_to_mirrorlake_sail', MEADOW_ARRIVAL.x - 6, MEADOW_ARRIVAL.z, { yaw: Math.PI / 2, r: 6 });
  place('meadow_signpost_entry', 'signpost_meadow', MEADOW_ARRIVAL.x + 4, MEADOW_ARRIVAL.z + 4.5, { yaw: Math.PI / 2 + 0.3, r: 1 });
  taken.push({ x: MEADOW_ARRIVAL.x, z: MEADOW_ARRIVAL.z, r: 7 });

  // ── 3. 區域 B：風車聚落（三座停擺的風車、農舍、穀倉、水井、農田）──
  WINDMILLS.forEach(([x, z], i) => place(`meadow_windmill_${pad2(i + 1)}`, i === 1 ? 'meadow_windmill_blue' : 'meadow_windmill', x, z, { scale: 6.5, yaw: -0.4 + i * 0.5, r: 5 }));
  place('meadow_barn', 'house_tall_red', HAMLET.x - 14, HAMLET.z + 14, { scale: 5.6, yaw: 0.5, r: 5 });
  place('meadow_cottage_01', 'house_small_yellow', HAMLET.x + 6, HAMLET.z + 16, { scale: 5.2, yaw: Math.PI + 0.3, r: 4 });
  place('meadow_cottage_02', 'house_tall_blue', HAMLET.x - 2, HAMLET.z - 14, { scale: 5, yaw: 0.1, r: 4 });
  place('meadow_well', 'well', HAMLET.x + 2, HAMLET.z + 2, { scale: 4.2, r: 2 });
  place('meadow_signpost_hamlet', 'signpost_meadow_hamlet', HAMLET.x - 18, HAMLET.z - 6, { yaw: 1.2, r: 1 });
  {
    // 農田：聚落東南的兩片作物田
    const rand = mulberry32(9601);
    let n = 0;
    for (const [fx, fz, crop] of [
      [HAMLET.x + 20, HAMLET.z + 22, 'k_wheat'],
      [HAMLET.x - 30, HAMLET.z + 30, 'k_corn'],
    ] as const) {
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 6; col++) {
          const x = fx + col * 1.8 + (rand() - 0.5) * 0.3;
          const z = fz + row * 2.2;
          if (meadowPathDistance(x, z) < MEADOW_TRAIL_HALF_WIDTH + 1) continue;
          n++;
          place(`meadow_crop_${pad3(n)}`, crop, x, z, { scale: 2.6 + rand() * 0.6, yaw: rand() * 6.28 });
        }
      }
      taken.push({ x: fx + 4.5, z: fz + 3.3, r: 7 });
    }
  }
  taken.push({ x: HAMLET.x, z: HAMLET.z, r: 12 });

  // ── 4. 區域 C：浮石山脊（頂上的浮石，之後的上升氣流）──
  {
    const rand = mulberry32(9602);
    for (let i = 0; i < 9; i++) {
      const t = (i + 0.5) / 9;
      const x = RIDGE.from[0] + (RIDGE.to[0] - RIDGE.from[0]) * t + (rand() - 0.5) * 6;
      const z = RIDGE.from[1] + (RIDGE.to[1] - RIDGE.from[1]) * t + (rand() - 0.5) * 10;
      place(`meadow_float_stone_${pad2(i + 1)}`, 'float_stone', x, z, { scale: 1 + rand() * 0.8, yaw: rand() * 6.28, r: 2.5 });
    }
  }

  // ── 5. 區域 D：風向塔台地（風向塔、風帆平台）；區域 E：競技場 ──
  place('meadow_wind_tower', 'wind_tower', TOWER.x, TOWER.z, { yaw: -Math.PI / 2, r: 6 });
  place('meadow_windsail_platform', 'windsail_platform', TOWER.x - 12, TOWER.z + 10, { yaw: -Math.PI / 2 + 0.3, r: 5 });
  place('meadow_signpost_tower', 'signpost_meadow_tower', 58, 31, { yaw: -Math.PI / 2 + 0.3, r: 1 });
  place('meadow_arena_ring', 'arena_ring', ARENA.x, ARENA.z, { r: ARENA.radius });

  // ── 6. 區域 A：彎月石拱 ──
  place('meadow_crescent_arch', 'crescent_arch', CRESCENT_ARCH.x, CRESCENT_ARCH.z, { yaw: 0.4, scale: 1.3, r: 7 });

  // ── 7. 散佈：開闊的草原（樹少、花多），受風傾斜的樹 ──
  const half = MEADOW_SIZE / 2;
  const sr = mulberry32(9603);
  let scattered = 0;
  function scatter(opts: { prefix: string; count: number; prefabs: string[]; spacing: number; scale: [number, number]; where?: (x: number, z: number) => boolean; trailClear?: number; maxSlope?: number; loose?: boolean }): void {
    let placed = 0;
    let attempts = 0;
    while (placed < opts.count && attempts < opts.count * 400) {
      attempts++;
      const x = (sr() * 2 - 1) * half;
      const z = (sr() * 2 - 1) * half;
      if (boundaryDistance(x, z) < 2.5) continue;
      if (opts.where && !opts.where(x, z)) continue;
      if (meadowPathDistance(x, z) < MEADOW_TRAIL_HALF_WIDTH + (opts.trailClear ?? 1.4)) continue;
      if (slopeAt(x, z) > (opts.maxSlope ?? 0.6)) continue;
      if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + opts.spacing)) continue;
      if (!opts.loose) taken.push({ x, z, r: opts.spacing });
      placed++;
      scattered++;
      const s = opts.scale[0] + sr() * (opts.scale[1] - opts.scale[0]);
      push({
        id: `${opts.prefix}_${pad3(placed)}`,
        prefabId: opts.prefabs[Math.floor(sr() * opts.prefabs.length)]!,
        regionId: regionAt(x + O.x, z + O.z),
        position: [round(x + O.x), round(height(x, z) - 0.05), round(z + O.z)],
        // 受風傾斜的樹一律彎向東（風往東吹）；其他隨機
        rotation: [0, round(opts.prefix === 'meadow_windbent' ? (sr() - 0.5) * 0.5 : sr() * Math.PI * 2), 0],
        scale: [round(s), round(s * (0.9 + sr() * 0.25)), round(s)],
      });
    }
    if (placed < opts.count) console.warn(`scatter ${opts.prefix}: placed ${placed}/${opts.count}`);
  }
  const lowland = (x: number, z: number) => ridgeWeight(x, z) < 0.05 && plateauWeight(x, z) < 0.05;
  scatter({ prefix: 'meadow_windbent', count: 60, prefabs: ['windbent_tree'], spacing: 4, scale: [1.2, 1.8], where: lowland, trailClear: 2.5 });
  scatter({ prefix: 'meadow_tree', count: 70, prefabs: ['k_tree_default', 'k_tree_fat', 'k_tree_simple', 'k_tree_plateau'], spacing: 5, scale: [5.5, 8.5], where: (x, z) => lowland(x, z) && Math.abs(z) > 60, trailClear: 2.5 });
  scatter({ prefix: 'meadow_bush', count: 90, prefabs: ['k_bush', 'k_bush_large', 'k_bush_detailed', 'k_bush_small'], spacing: 1.2, scale: [2.4, 4], where: lowland });
  scatter({ prefix: 'meadow_flower', count: 260, prefabs: ['k_flower_red', 'k_flower_purple', 'k_flower_yellow'], spacing: 0.5, scale: [2.4, 3.6], loose: true, trailClear: 0.6, where: lowland });
  scatter({ prefix: 'meadow_grass', count: 200, prefabs: ['k_grass_large', 'k_grass_leafs'], spacing: 0.5, scale: [2.6, 4], loose: true, trailClear: 0.4 });
  scatter({ prefix: 'meadow_rock', count: 40, prefabs: ['k_rock_large_a', 'k_rock_large_b', 'k_rock_large_c', 'gm_stone_large_a'], spacing: 1.8, scale: [2, 3.6] });
  scatter({ prefix: 'meadow_ridge_rock', count: 30, prefabs: ['k_rock_tall_a', 'k_rock_tall_b', 'k_rock_large_d'], spacing: 2, scale: [2.4, 4], maxSlope: 3, where: (x, z) => ridgeWeight(x, z) > 0.1 && ridgeWeight(x, z) < 0.9 });

  // ── 8. 地圖邊界：迷霧牆外兩排樹 ──
  {
    const edgeRand = mulberry32(20261017);
    const outline = boundaryOutline(3.2, 8, 0);
    let n = 0;
    for (const p of outline) {
      for (const [from, to] of [
        [2, 4],
        [5, 9],
      ] as const) {
        if (edgeRand() < 0.25) continue;
        const len = Math.hypot(p.x, p.z);
        const pushOut = from + edgeRand() * (to - from);
        const jitter = (edgeRand() - 0.5) * 2.4;
        const x = p.x + (p.x / len) * pushOut + (-p.z / len) * jitter;
        const z = p.z + (p.z / len) * pushOut + (p.x / len) * jitter;
        if (Math.max(Math.abs(x), Math.abs(z)) > half - 0.5) continue;
        if (boundaryDistance(x, z) > -1.5) continue;
        n++;
        const s = 7 + edgeRand() * 4;
        const kind = edgeRand();
        push({
          id: `meadow_edge_tree_${pad3(n)}`,
          prefabId: kind < 0.5 ? 'k_edge_oak' : kind < 0.8 ? 'k_edge_pine' : 'k_edge_cone',
          regionId: regionAt(x + O.x, z + O.z),
          position: [round(x + O.x), round(height(x, z) - 0.05), round(z + O.z)],
          rotation: [0, round(edgeRand() * Math.PI * 2), 0],
          scale: [round(s), round(s * (0.9 + edgeRand() * 0.25)), round(s)],
        });
      }
    }
    console.log(`placed ${n} meadow boundary trees`);
  }

  placements.push(...out);
  console.log(`added ${out.length} meadow placements (${scattered} scattered)`);
}
