// 任務 8A：螢苔祕林（Bible §6，地圖二）的 placement。由 gen-placements.ts 在晨曦谷地之後呼叫。
// 地圖在世界座標 GLOWMOSS_ORIGIN（決策 T-117），這裡以局部座標配置後加上原點。
// 手動配置的地標（入口、月牙樹、發光石環、苔冠空地、斷流小渠與閘門、根鬚迷宮）＋ 各區散佈 ＋ 邊界樹。
// 晨曦谷地這一側只加入林道入口與路標。全部使用獨立的固定種子，結果可重現。
import { readFileSync } from 'node:fs';
import { mulberry32 } from '../src/game-core/util/random.ts';
import { boundaryDistance, boundaryOutline } from '../src/game-core/world/bounds.ts';
import {
  CHANNEL_CROSSINGS,
  CHANNEL_HALF_WIDTH,
  CHANNEL_PATH,
  channelDistance,
  CRESCENT_TREE,
  GLOWMOSS_ARRIVAL,
  GLOWMOSS_ORIGIN,
  GLOWMOSS_SIZE,
  GLOWMOSS_TRAILS,
  glowmossHeight,
  glowmossPathDistance,
  MOSS_CROWN,
  ROOT_MAZE,
  STONE_RING,
  TRAIL_HALF_WIDTH,
} from '../src/game-core/world/glowmossTerrain.ts';
import { terrainHeight } from '../src/game-core/world/terrain.ts';

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
type RegionArea = { center: [number, number]; path?: [number, number][]; radius: number; blend: number };
const regions = JSON.parse(readFileSync('src/data/regions.json', 'utf8')) as { id: string; area?: RegionArea }[];

function segmentDistance(x: number, z: number, a: readonly [number, number], b: readonly [number, number]): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - a[0]) * dx + (z - a[1]) * dz) / len2)) : 0;
  return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
}

/** 與 game-core 的 regionAt 相同規則（權重最大、同權重取範圍較小者；預設為螢苔林地）；世界座標 */
function regionAt(x: number, z: number): string {
  let best = 'moss_glade';
  let bestWeight = 0.5;
  let bestRadius = Infinity;
  for (const r of regions) {
    if (!r.area) continue;
    const { center, path, radius, blend } = r.area;
    let d = Math.hypot(x - center[0], z - center[1]);
    if (path) {
      d = Infinity;
      for (let i = 0; i + 1 < path.length; i++) d = Math.min(d, segmentDistance(x, z, path[i]!, path[i + 1]!));
    }
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

const O = GLOWMOSS_ORIGIN;
const height = glowmossHeight;

function slopeAt(x: number, z: number): number {
  return Math.hypot(height(x + 0.6, z) - height(x - 0.6, z), height(x, z + 0.6) - height(x, z - 0.6)) / 1.2;
}

/** 把模型的 X 軸對齊到與方向 (dx, dz) 垂直（拱門、閘門橫跨小徑或渠道） */
function yawAcross(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

/** 折線在某點附近的方向 */
function directionNear(line: readonly (readonly [number, number])[], x: number, z: number): [number, number] {
  let best = Infinity;
  let dir: [number, number] = [1, 0];
  for (let i = 0; i + 1 < line.length; i++) {
    const d = segmentDistance(x, z, line[i]!, line[i + 1]!);
    if (d < best) {
      best = d;
      const dx = line[i + 1]![0] - line[i]![0];
      const dz = line[i + 1]![1] - line[i]![1];
      const len = Math.hypot(dx, dz) || 1;
      dir = [dx / len, dz / len];
    }
  }
  return dir;
}

/** 根鬚迷宮：5 × 5 格（每格 8 m）的迷宮，以固定種子的深度優先產生；西南角是入口 */
const MAZE = { cells: 5, cell: 8 } as const;
const mazeX0 = ROOT_MAZE.x - (MAZE.cells * MAZE.cell) / 2;
const mazeZ0 = ROOT_MAZE.z - (MAZE.cells * MAZE.cell) / 2;
function inMaze(x: number, z: number, margin = 0): boolean {
  return x > mazeX0 - margin && x < mazeX0 + MAZE.cells * MAZE.cell + margin && z > mazeZ0 - margin && z < mazeZ0 + MAZE.cells * MAZE.cell + margin;
}

export function addGlowmoss(placements: Out[]): void {
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

  // ── 1. 晨曦谷地這一側：溪東荒野道路盡頭的林道入口（往東走進迷霧中的森林） ──
  {
    const gate = { x: 136, z: 6.5 };
    const gateOut: Out[] = [
      {
        id: 'dawn_gate_glowmoss',
        prefabId: 'gate_to_glowmoss',
        regionId: 'meadow',
        position: [gate.x, round(terrainHeight(gate.x, gate.z) - 0.05), gate.z],
        // 背對入口的方向是西（抵達晨曦谷地時面向西走回谷地）
        rotation: [0, round(-Math.PI / 2), 0],
        scale: [1, 1, 1],
      },
      {
        id: 'dawn_signpost_glowmoss',
        prefabId: 'signpost_glowmoss_gate',
        regionId: 'meadow',
        position: [131.5, round(terrainHeight(131.5, 3.4) - 0.03), 3.4],
        rotation: [0, round(-Math.PI / 2 + 0.3), 0],
        scale: [1, 1, 1],
      },
    ];
    for (const o of gateOut) push(o);
  }

  // ── 2. 入口：林緣小徑西端的林道入口（回晨曦谷地）──
  place('glowmoss_gate_dawnvale', 'gate_to_dawnvale', GLOWMOSS_ARRIVAL.x - 6, GLOWMOSS_ARRIVAL.z, { yaw: Math.PI / 2, r: 6 });
  place('glowmoss_signpost_trail', 'signpost_moss_trail', GLOWMOSS_ARRIVAL.x + 4, GLOWMOSS_ARRIVAL.z + 4.5, { yaw: Math.PI / 2 + 0.3, r: 1 });
  taken.push({ x: GLOWMOSS_ARRIVAL.x, z: GLOWMOSS_ARRIVAL.z, r: 7 });

  // 小徑上的樹根拱門
  const archAt: [number, number][] = [
    [-118, 0.8],
    [-96, 4.6],
    [-70, 5.4],
    [-44, -3],
  ];
  archAt.forEach(([x, z], i) => {
    const [dx, dz] = directionNear(GLOWMOSS_TRAILS[0]!, x, z);
    place(`glowmoss_root_arch_${pad2(i + 1)}`, 'root_arch', x, z, { yaw: yawAcross(dx, dz), scale: 1 + (i % 2) * 0.12, dy: -0.15, r: 3.5 });
  });

  // ── 3. 螢苔林地：月牙樹、發光石環 ──
  place('glowmoss_crescent_tree', 'crescent_tree', CRESCENT_TREE.x, CRESCENT_TREE.z, { yaw: 0.4, scale: 1.15, dy: -0.1, r: 7 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    place(`glowmoss_crescent_moss_${pad2(i + 1)}`, 'glowmoss_patch', CRESCENT_TREE.x + Math.cos(a) * 4.2, CRESCENT_TREE.z + Math.sin(a) * 4.2, { scale: 1.3, yaw: a });
  }
  const ringStones = 8;
  for (let i = 0; i < ringStones; i++) {
    const a = (i / ringStones) * Math.PI * 2;
    const x = STONE_RING.x + Math.cos(a) * 6.4;
    const z = STONE_RING.z + Math.sin(a) * 6.4;
    // 立石的刻紋（+Z 面）朝向圓心
    place(`glowmoss_ring_stone_${pad2(i + 1)}`, 'glow_stone', x, z, { yaw: Math.atan2(STONE_RING.x - x, STONE_RING.z - z), scale: 1 + (i % 3) * 0.12 });
  }
  place('glowmoss_ring_altar', 'gm_stone_large_a', STONE_RING.x, STONE_RING.z, { scale: 2.6, yaw: 0.5, sy: 1.4 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.6;
    place(`glowmoss_ring_moss_${pad2(i + 1)}`, 'glowmoss_patch', STONE_RING.x + Math.cos(a) * 3.2, STONE_RING.z + Math.sin(a) * 3.2, { scale: 1.1, yaw: a });
  }
  taken.push({ x: STONE_RING.x, z: STONE_RING.z, r: STONE_RING.radius + 3 });

  // ── 4. 苔冠空地：巨大蘑菇樹與周圍的菌類 ──
  place('glowmoss_giant_mushroom', 'giant_mushroom', MOSS_CROWN.x, MOSS_CROWN.z, { yaw: 0.8, scale: 1, r: 8 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.2;
    const r = MOSS_CROWN.radius - 3 - (i % 3) * 2;
    const x = MOSS_CROWN.x + Math.cos(a) * r;
    const z = MOSS_CROWN.z + Math.sin(a) * r;
    if (Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI))) < 0.45) continue; // 西側開口保持淨空
    place(`glowmoss_crown_mushroom_${pad2(i + 1)}`, i % 2 ? 'gm_mushroom_tan_tall' : 'k_mushroom_tall', x, z, { scale: 4 + (i % 4), yaw: a });
    place(`glowmoss_crown_glow_${pad2(i + 1)}`, 'glow_mushrooms', x + Math.cos(a + 1) * 1.6, z + Math.sin(a + 1) * 1.6, { scale: 2.2, yaw: a });
  }
  taken.push({ x: MOSS_CROWN.x, z: MOSS_CROWN.z, r: MOSS_CROWN.radius + 1 });
  place('glowmoss_signpost_crown', 'signpost_moss_crown', MOSS_CROWN.x - MOSS_CROWN.radius - 8, MOSS_CROWN.z + 4, { yaw: -Math.PI / 2 + 0.3, r: 1 });

  // ── 5. 斷流小渠：北邊的泉眼、被樹根堵住的渠道、兩座古水渠閘門 ──
  const spring = CHANNEL_PATH[0]!;
  const springAt = { x: spring[0] - 2, z: spring[1] + 14 };
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    place(`glowmoss_spring_stone_${pad2(i + 1)}`, i % 2 ? 'gm_stone_large_c' : 'gm_stone_large_a', springAt.x + Math.cos(a) * 5.5, springAt.z + Math.sin(a) * 5.5, { scale: 2.2 + (i % 3) * 0.5, yaw: a });
  }
  {
    // 堵住渠道的樹根（之後的任務移開）
    const z = -126;
    const x = 31.5;
    const [dx, dz] = directionNear(CHANNEL_PATH, x, z);
    place('glowmoss_channel_roots', 'root_wall', x, z, { yaw: yawAcross(dx, dz), scale: 1, dy: -0.4, r: 5 });
  }
  const gates: [number, number][] = [
    [29.4, -100],
    [13.1, -62],
  ];
  gates.forEach(([x, z], i) => {
    const [dx, dz] = directionNear(CHANNEL_PATH, x, z);
    place(`glowmoss_water_gate_${pad2(i + 1)}`, 'water_gate', x, z, { yaw: yawAcross(dx, dz), dy: -0.1, r: 4.5 });
  });
  place('glowmoss_signpost_channel', 'signpost_channel', 8, -14, { yaw: 0.6, r: 1 });
  // 渠道兩岸的碎石
  {
    const rand = mulberry32(8812);
    for (let i = 0; i < 46; i++) {
      const seg = Math.floor(rand() * (CHANNEL_PATH.length - 1));
      const a = CHANNEL_PATH[seg]!;
      const b = CHANNEL_PATH[seg + 1]!;
      const t = rand();
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const side = rand() < 0.5 ? -1 : 1;
      const off = CHANNEL_HALF_WIDTH + 0.4 + rand() * 1.6;
      const x = a[0] + (b[0] - a[0]) * t + (-(b[1] - a[1]) / len) * off * side;
      const z = a[1] + (b[1] - a[1]) * t + ((b[0] - a[0]) / len) * off * side;
      if (Math.max(Math.abs(x), Math.abs(z)) > 140) continue;
      if (CHANNEL_CROSSINGS.some((c) => Math.hypot(c.x - x, c.z - z) < 6)) continue;
      if (glowmossPathDistance(x, z) < TRAIL_HALF_WIDTH + 1) continue;
      place(`glowmoss_channel_stone_${pad3(i + 1)}`, 'gm_stone_small_c', x, z, { scale: 2.5 + rand() * 2.5, yaw: rand() * 6.28 });
    }
  }

  // ── 6. 根鬚迷宮：樹根牆圍出的通道，最深處有寶箱 ──
  {
    const rand = mulberry32(8813);
    const n = MAZE.cells;
    // 每格的四面牆：0 北 1 東 2 南 3 西（北為 -Z）
    const walls = Array.from({ length: n * n }, () => [true, true, true, true]);
    const seen = new Set<number>();
    const depth = new Map<number, number>();
    const stack = [n * (n - 1)]; // 西南角（i = 0, j = n − 1）
    seen.add(stack[0]!);
    depth.set(stack[0]!, 0);
    const dirs = [
      [0, -1, 0, 2],
      [1, 0, 1, 3],
      [0, 1, 2, 0],
      [-1, 0, 3, 1],
    ] as const;
    while (stack.length > 0) {
      const cur = stack[stack.length - 1]!;
      const ci = cur % n;
      const cj = Math.floor(cur / n);
      const options = dirs.filter(([di, dj]) => {
        const ni = ci + di;
        const nj = cj + dj;
        return ni >= 0 && nj >= 0 && ni < n && nj < n && !seen.has(nj * n + ni);
      });
      if (options.length === 0) {
        stack.pop();
        continue;
      }
      const [di, dj, wall, opposite] = options[Math.floor(rand() * options.length)]!;
      const next = (cj + dj) * n + (ci + di);
      walls[cur]![wall] = false;
      walls[next]![opposite] = false;
      seen.add(next);
      depth.set(next, depth.get(cur)! + 1);
      stack.push(next);
    }
    // 入口：西南角的西牆
    walls[n * (n - 1)]![3] = false;
    let w = 0;
    const cellX = (i: number) => mazeX0 + (i + 0.5) * MAZE.cell;
    const cellZ = (j: number) => mazeZ0 + (j + 0.5) * MAZE.cell;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const cw = walls[j * n + i]!;
        // 每面牆只放一次：北牆與西牆屬於這一格，最東一排放東牆、最南一排放南牆
        const edges: [boolean, number, number, number][] = [
          [cw[0]!, cellX(i), cellZ(j) - MAZE.cell / 2, 0],
          [cw[3]!, cellX(i) - MAZE.cell / 2, cellZ(j), Math.PI / 2],
        ];
        if (i === n - 1) edges.push([cw[1]!, cellX(i) + MAZE.cell / 2, cellZ(j), Math.PI / 2]);
        if (j === n - 1) edges.push([cw[2]!, cellX(i), cellZ(j) + MAZE.cell / 2, 0]);
        for (const [solid, x, z, yaw] of edges) {
          if (!solid) continue;
          w++;
          place(`glowmoss_maze_wall_${pad3(w)}`, 'root_wall', x, z, { yaw: yaw + (rand() - 0.5) * 0.06, scale: 1, sy: 0.9 + rand() * 0.25, dy: -0.35 });
        }
      }
    }
    // 寶箱放在離入口最遠的格子
    let far = 0;
    for (const [cell, d] of depth) if (d > (depth.get(far) ?? -1)) far = cell;
    const fx = cellX(far % n);
    const fz = cellZ(Math.floor(far / n));
    place('glowmoss_maze_chest', 'chest_glowmoss', fx, fz, { yaw: rand() * 6.28 });
    place('glowmoss_maze_chest_moss', 'glowmoss_patch', fx + 1.8, fz + 1.2, { scale: 1.2 });
    // 迷宮裡零星的蘑菇與蕨類
    for (let k = 0; k < n * n; k++) {
      if (rand() < 0.45) continue;
      const x = cellX(k % n) + (rand() - 0.5) * 4;
      const z = cellZ(Math.floor(k / n)) + (rand() - 0.5) * 4;
      if (Math.hypot(x - fx, z - fz) < 2.5) continue;
      place(`glowmoss_maze_plant_${pad2(k + 1)}`, rand() < 0.5 ? 'gm_fern_tall' : 'glow_mushrooms', x, z, { scale: 2.2 + rand() * 1.5, yaw: rand() * 6.28 });
    }
    place('glowmoss_signpost_maze', 'signpost_root_maze', mazeX0 - 4, mazeZ0 + MAZE.cell * (n - 0.5) - 4.5, { yaw: -Math.PI / 2 + 0.4, r: 1 });
    console.log(`root maze: ${w} walls`);
  }

  // ── 7. 各區散佈 ──
  const sr = mulberry32(20261014);
  let scattered = 0;
  const half = GLOWMOSS_SIZE / 2;
  function scatter(opts: {
    prefix: string;
    count: number;
    prefabs: readonly string[];
    spacing: number;
    scale: [number, number];
    area?: { x: number; z: number; r: number };
    where?: (x: number, z: number) => boolean;
    trailClear?: number;
    maxSlope?: number;
    loose?: boolean;
    dy?: number;
  }): void {
    let placed = 0;
    let attempts = 0;
    while (placed < opts.count && attempts < opts.count * 400) {
      attempts++;
      let x: number;
      let z: number;
      if (opts.area) {
        const a = sr() * Math.PI * 2;
        const r = Math.sqrt(sr()) * opts.area.r;
        x = opts.area.x + Math.cos(a) * r;
        z = opts.area.z + Math.sin(a) * r;
      } else {
        x = (sr() * 2 - 1) * half;
        z = (sr() * 2 - 1) * half;
      }
      if (boundaryDistance(x, z) < 2.5) continue;
      if (opts.where && !opts.where(x, z)) continue;
      if (glowmossPathDistance(x, z) < TRAIL_HALF_WIDTH + (opts.trailClear ?? 1.4)) continue;
      if (channelDistance(x, z) < CHANNEL_HALF_WIDTH + 1.2) continue;
      if (slopeAt(x, z) > (opts.maxSlope ?? 0.7)) continue;
      if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + opts.spacing)) continue;
      if (!opts.loose) taken.push({ x, z, r: opts.spacing });
      placed++;
      scattered++;
      const s = opts.scale[0] + sr() * (opts.scale[1] - opts.scale[0]);
      push({
        id: `${opts.prefix}_${pad3(placed)}`,
        prefabId: opts.prefabs[Math.floor(sr() * opts.prefabs.length)]!,
        regionId: regionAt(x + O.x, z + O.z),
        position: [round(x + O.x), round(height(x, z) - 0.05 + (opts.dy ?? 0)), round(z + O.z)],
        rotation: [0, round(sr() * Math.PI * 2), 0],
        scale: [round(s), round(s * (0.9 + sr() * 0.25)), round(s)],
      });
    }
    if (placed < opts.count) console.warn(`scatter ${opts.prefix}: placed ${placed}/${opts.count}`);
  }
  const outsideCrown = (x: number, z: number) => Math.hypot(x - MOSS_CROWN.x, z - MOSS_CROWN.z) > MOSS_CROWN.radius + 2;
  const outsideMaze = (x: number, z: number) => !inMaze(x, z, 3);
  const open = (x: number, z: number) => outsideCrown(x, z) && outsideMaze(x, z);
  const glade = { x: -15, z: 15, r: 70 };
  const nearGlade = (x: number, z: number) => Math.hypot(x - glade.x, z - glade.z) < glade.r;

  // 遠景框景的大樹（高大、可砍，留出遠景視線：只放在林地外圍）
  scatter({
    prefix: 'glowmoss_giant_tree',
    count: 46,
    prefabs: ['gm_tree_oak', 'gm_tree_fat', 'gm_tree_detailed'],
    spacing: 6,
    scale: [12, 16],
    trailClear: 5,
    where: (x, z) => open(x, z) && !nearGlade(x, z),
  });
  // 一般樹木：六種高大的森林樹＋暗色針葉
  scatter({
    prefix: 'glowmoss_tree',
    count: 430,
    prefabs: ['gm_tree_oak', 'gm_tree_default', 'gm_tree_detailed', 'gm_tree_fat', 'gm_tree_plateau', 'gm_tree_thin', 'gm_tree_simple', 'k_tree_tall_dark', 'k_tree_cone_dark'],
    spacing: 3.1,
    scale: [6.5, 10.5],
    trailClear: 2.2,
    where: open,
  });
  scatter({ prefix: 'glowmoss_bush', count: 140, prefabs: ['k_bush', 'k_bush_large', 'k_bush_detailed', 'k_bush_small'], spacing: 1.2, scale: [2.5, 4.2], where: open });
  scatter({ prefix: 'glowmoss_fern', count: 520, prefabs: ['gm_fern_short', 'gm_fern_tall', 'gm_fern_tall'], spacing: 0.4, scale: [2.8, 5], loose: true, trailClear: 0.4, where: outsideMaze });
  scatter({
    prefix: 'glowmoss_mushroom',
    count: 170,
    prefabs: ['gm_mushroom_tan', 'gm_mushroom_tan_tall', 'k_mushroom_red', 'k_mushroom_group', 'k_mushroom_tan'],
    spacing: 0.5,
    scale: [2.6, 5],
    loose: true,
    where: outsideMaze,
  });
  scatter({ prefix: 'glowmoss_stone', count: 44, prefabs: ['gm_stone_large_a', 'gm_stone_large_c', 'k_rock_large_a', 'k_rock_large_b'], spacing: 1.8, scale: [2.2, 4.2], where: open });
  scatter({ prefix: 'glowmoss_pebble', count: 22, prefabs: ['gm_stone_small_a'], spacing: 1, scale: [3, 4.5], where: open });
  scatter({ prefix: 'glowmoss_log', count: 26, prefabs: ['k_log_large', 'k_log'], spacing: 2, scale: [2.6, 4], where: open, maxSlope: 0.4 });
  scatter({ prefix: 'glowmoss_stump', count: 24, prefabs: ['k_stump_old', 'k_stump_old_tall'], spacing: 1.4, scale: [2.4, 3.6], where: open });
  // 發光只用在少數關鍵植物（Bible §6.3）：螢苔林地與地標附近
  scatter({ prefix: 'glowmoss_moss', count: 90, prefabs: ['glowmoss_patch'], spacing: 1.2, scale: [1, 2.2], area: glade, trailClear: 0.6, loose: true });
  scatter({ prefix: 'glowmoss_glowcap', count: 44, prefabs: ['glow_mushrooms'], spacing: 1, scale: [1.6, 2.6], area: glade, loose: true });
  // 可採集的螢苔與月露草（之後的任務 quest_forest_001：螢苔 × 5、月露草 × 3）
  scatter({ prefix: 'glowmoss_tuft', count: 26, prefabs: ['glowmoss_tuft'], spacing: 2, scale: [1.6, 1.9], area: glade, trailClear: 1, where: (x, z) => glowmossPathDistance(x, z) < 12 });
  scatter({
    prefix: 'glowmoss_moondew',
    count: 18,
    prefabs: ['moondew'],
    spacing: 2.5,
    scale: [1.6, 1.9],
    where: (x, z) => open(x, z) && channelDistance(x, z) < CHANNEL_HALF_WIDTH + 9,
  });
  scatter({ prefix: 'glowmoss_moondew_decor', count: 34, prefabs: ['moondew_decor'], spacing: 0.8, scale: [1.4, 1.8], loose: true, where: (x, z) => channelDistance(x, z) < CHANNEL_HALF_WIDTH + 12 });

  // ── 8. 地圖邊界：迷霧牆外兩排暗色的大樹 ──
  {
    const edgeRand = mulberry32(20261015);
    const outline = boundaryOutline(3.2, 8, 0);
    let n = 0;
    for (const p of outline) {
      for (const [from, to] of [
        [2, 4],
        [5, 9],
      ] as const) {
        if (edgeRand() < 0.2) continue;
        const len = Math.hypot(p.x, p.z);
        const pushOut = from + edgeRand() * (to - from);
        const jitter = (edgeRand() - 0.5) * 2.4;
        const x = p.x + (p.x / len) * pushOut + (-p.z / len) * jitter;
        const z = p.z + (p.z / len) * pushOut + (p.x / len) * jitter;
        if (Math.max(Math.abs(x), Math.abs(z)) > half - 0.5) continue;
        if (boundaryDistance(x, z) > -1.5) continue;
        n++;
        const s = 8 + edgeRand() * 5;
        const kind = edgeRand();
        push({
          id: `glowmoss_edge_tree_${pad3(n)}`,
          prefabId: kind < 0.4 ? 'gm_edge_oak' : kind < 0.7 ? 'gm_edge_fat' : 'gm_edge_tall',
          regionId: regionAt(x + O.x, z + O.z),
          position: [round(x + O.x), round(height(x, z) - 0.05), round(z + O.z)],
          rotation: [0, round(edgeRand() * Math.PI * 2), 0],
          scale: [round(s), round(s * (0.9 + edgeRand() * 0.25)), round(s)],
        });
      }
    }
    console.log(`placed ${n} glowmoss boundary trees`);
  }

  placements.push(...out);
  console.log(`added ${out.length} glowmoss placements (${scattered} scattered)`);
}
