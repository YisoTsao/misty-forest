// 任務 9A：澄鏡湖（Bible §7，地圖三）的 placement。由 gen-placements.ts 在螢苔祕林之後呼叫。
// 地圖在世界座標 MIRRORLAKE_ORIGIN（決策 T-117），這裡以局部座標配置後加上原點。
// 手動配置的地標（水道入口、湖畔營地與漁屋、木碼頭、燈船、月弧木橋、倒影蘆葦島、三面水鏡、半沉沒鐘樓、水鏡遺構、水鏡神殿）
// ＋ 湖岸散佈（樹、灌木、圓石、蘆葦、睡蓮）＋ 邊界樹。螢苔祕林這一側只加入小渠南端的水道入口。全部使用獨立的固定種子。
import { readFileSync } from 'node:fs';
import { mulberry32 } from '../src/game-core/util/random.ts';
import { boundaryDistance, boundaryOutline } from '../src/game-core/world/bounds.ts';
import { CHANNEL_PATH, GLOWMOSS_ORIGIN, glowmossHeight } from '../src/game-core/world/glowmossTerrain.ts';
import {
  LAKE_CAMP,
  MIRROR_PILLARS,
  MIRROR_RUINS,
  MIRROR_TEMPLE,
  MIRRORLAKE_ARRIVAL,
  MIRRORLAKE_ORIGIN,
  MIRRORLAKE_SIZE,
  MIRRORLAKE_TRAIL_HALF_WIDTH,
  mirrorlakeHeight,
  mirrorlakePathDistance,
  MOON_BRIDGE,
  REED_ISLE,
  SHALLOW_HALF_WIDTH,
  shallowPathDistance,
  SUNKEN_BELL,
} from '../src/game-core/world/mirrorlakeTerrain.ts';

type Out = {
  id: string;
  prefabId: string;
  regionId: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
};
type Taken = { x: number; z: number; r: number };

const WATER = -1;
const round = (n: number) => Math.round(n * 100) / 100;
const pad2 = (n: number) => String(n).padStart(2, '0');
const pad3 = (n: number) => String(n).padStart(3, '0');
type RegionArea = { center: [number, number]; radius: number; blend: number };
const regions = JSON.parse(readFileSync('src/data/regions.json', 'utf8')) as { id: string; area?: RegionArea }[];

/** 與 game-core 的 regionAt 相同規則（權重最大、同權重取範圍較小者；預設為湖岸）；世界座標 */
function regionAt(x: number, z: number): string {
  let best = 'lake_shore';
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

const O = MIRRORLAKE_ORIGIN;
const height = mirrorlakeHeight;

function slopeAt(x: number, z: number): number {
  return Math.hypot(height(x + 0.6, z) - height(x - 0.6, z), height(x, z + 0.6) - height(x, z - 0.6)) / 1.2;
}

/** 螢苔祕林小渠南端的水道入口（局部座標，渠道中央；堵住的樹根在北邊 7 m，任務 8D-2 完成後退開） */
const GLOWMOSS_LAKE_GATE_Z = 143;
function channelCenterAt(z: number): number {
  for (let i = 0; i + 1 < CHANNEL_PATH.length; i++) {
    const a = CHANNEL_PATH[i]!;
    const b = CHANNEL_PATH[i + 1]!;
    if (z < Math.min(a[1], b[1]) || z > Math.max(a[1], b[1])) continue;
    return a[0] + ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]);
  }
  throw new Error(`渠道沒有經過 z = ${z}`);
}

export function addMirrorlake(placements: Out[]): void {
  const out: Out[] = [];
  const taken: Taken[] = [];
  const ids = new Set(placements.map((p) => p.id));
  const push = (o: Out) => {
    if (ids.has(o.id)) throw new Error(`placement id 重複：${o.id}`);
    ids.add(o.id);
    out.push(o);
  };
  /** 以局部座標放置（y 省略時貼地；y 指定時為絕對高度） */
  const place = (id: string, prefabId: string, x: number, z: number, o: { scale?: number; yaw?: number; dy?: number; y?: number; r?: number; sy?: number } = {}) => {
    const s = o.scale ?? 1;
    push({
      id,
      prefabId,
      regionId: regionAt(x + O.x, z + O.z),
      position: [round(x + O.x), round(o.y ?? height(x, z) - 0.03 + (o.dy ?? 0)), round(z + O.z)],
      rotation: [0, round(o.yaw ?? 0), 0],
      scale: [s, round(s * (o.sy ?? 1)), s],
    });
    if (o.r) taken.push({ x, z, r: o.r });
  };

  // ── 1. 螢苔祕林這一側：小渠南端的水道入口（往南順著水道走到澄鏡湖），移除與它重疊的散佈點綴 ──
  {
    const gx = channelCenterAt(GLOWMOSS_LAKE_GATE_Z);
    const gz = GLOWMOSS_LAKE_GATE_Z;
    const scatter = /^glowmoss_(giant_tree|tree|bush|fern|mushroom|stone|pebble|log|stump|moss|glowcap|moondew_decor|channel_stone|edge_tree)_\d+$/;
    for (let i = placements.length - 1; i >= 0; i--) {
      const p = placements[i]!;
      if (scatter.test(p.id) && Math.hypot(p.position[0] - GLOWMOSS_ORIGIN.x - gx, p.position[2] - GLOWMOSS_ORIGIN.z - gz) < 6) placements.splice(i, 1);
    }
    push({
      id: 'glowmoss_gate_mirrorlake',
      prefabId: 'gate_to_mirrorlake',
      regionId: 'moss_glade',
      position: [round(gx + GLOWMOSS_ORIGIN.x), round(glowmossHeight(gx, gz) - 0.05), round(gz + GLOWMOSS_ORIGIN.z)],
      // 背對入口的方向是北（抵達螢苔祕林時面向北走回林地）
      rotation: [0, round(Math.PI), 0],
      scale: [1, 1, 1],
    });
  }

  // ── 2. 入口：北邊林間水道的盡頭（回螢苔祕林），抵達時面向南方的湖 ──
  place('mirrorlake_gate_glowmoss', 'gate_to_glowmoss_lake', MIRRORLAKE_ARRIVAL.x, MIRRORLAKE_ARRIVAL.z - 6, { yaw: 0, r: 6 });
  place('mirrorlake_signpost_entry', 'signpost_mirrorlake', MIRRORLAKE_ARRIVAL.x + 4.5, MIRRORLAKE_ARRIVAL.z + 3, { yaw: 0.3, r: 1 });
  taken.push({ x: MIRRORLAKE_ARRIVAL.x, z: MIRRORLAKE_ARRIVAL.z, r: 7 });

  // ── 3. 區域 A：湖畔營地與漁屋、木碼頭、燈船 ──
  place('mirrorlake_fisher_hut', 'fisher_hut', LAKE_CAMP.x - 6, LAKE_CAMP.z - 4, { yaw: Math.PI / 2, dy: 0.2, r: 5 });
  place('mirrorlake_camp_fire_stones', 'k_campfire_stones', LAKE_CAMP.x + 2, LAKE_CAMP.z + 4, { scale: 2.2, r: 2 });
  place('mirrorlake_camp_fire_logs', 'k_campfire_logs', LAKE_CAMP.x + 2, LAKE_CAMP.z + 4, { scale: 2.2 });
  place('mirrorlake_camp_tent', 'k_tent', LAKE_CAMP.x - 3, LAKE_CAMP.z + 10, { yaw: 0.6, scale: 2.6, r: 3 });
  place('mirrorlake_camp_logs', 'k_log_stack', LAKE_CAMP.x - 9, LAKE_CAMP.z + 6, { yaw: 1.2, scale: 2.4, r: 1.6 });
  place('mirrorlake_camp_seat_01', 'k_log', LAKE_CAMP.x + 5, LAKE_CAMP.z + 2, { yaw: 1.4, scale: 2.4 });
  place('mirrorlake_camp_seat_02', 'k_log', LAKE_CAMP.x + 1, LAKE_CAMP.z + 8, { yaw: 0.1, scale: 2.4 });
  place('mirrorlake_camp_canoe', 'k_canoe', -80, 22, { yaw: 1.9, scale: 2.4, dy: 0.05, r: 2 });
  place('mirrorlake_signpost_camp', 'signpost_lake_camp', LAKE_CAMP.x + 9, LAKE_CAMP.z - 9, { yaw: Math.PI / 2 + 0.3, r: 1 });
  // 木碼頭：從營地東邊的沙岸往東伸進湖裡（模型 +Z 為碼頭方向）；橋面高於水面 1.2 m
  place('mirrorlake_dock', 'wood_dock', -77, 30, { yaw: Math.PI / 2, y: -0.1, r: 2 });
  for (let k = 0; k < 5; k++) taken.push({ x: -77 + k * 2.5, z: 30, r: 2 });
  place('mirrorlake_lantern_boat', 'lantern_boat', -69.5, 32.8, { yaw: Math.PI / 2 + 0.15, y: WATER - 0.05 });
  // 淺水石徑兩側的踏腳石（標出可以涉水的路線）
  {
    const rand = mulberry32(9101);
    let n = 0;
    for (let x = -66; x <= 30; x += 6) {
      for (const side of [-1, 1]) {
        let z = 0;
        let best = Infinity;
        for (let zz = -10; zz <= 30; zz += 0.25) {
          const d = Math.abs(shallowPathDistance(x, zz) - (SHALLOW_HALF_WIDTH + 0.6));
          if (d < best && Math.sign(zz - 13) === side) {
            best = d;
            z = zz;
          }
        }
        if (best > 0.4 || height(x, z) > WATER + 0.2) continue;
        n++;
        place(`mirrorlake_shallow_stone_${pad3(n)}`, 'pebble_d', x + (rand() - 0.5) * 2, z, { scale: 1.6 + rand() * 0.8, yaw: rand() * 6.28, dy: -0.05 });
      }
    }
  }

  // ── 4. 區域 C：月弧木橋與倒影蘆葦島 ──
  {
    const [[, za], [, zb]] = MOON_BRIDGE;
    place('mirrorlake_moon_bridge', 'moon_bridge', MOON_BRIDGE[0][0], (za + zb) / 2, { yaw: 0, y: -0.35, r: 3 });
    for (let z = za; z <= zb; z += 3) taken.push({ x: MOON_BRIDGE[0][0], z, r: 2.4 });
    place('mirrorlake_signpost_bridge', 'signpost_moon_bridge', MOON_BRIDGE[0][0] + 3.2, za - 4, { yaw: 0.2, r: 1 });
  }
  taken.push({ x: REED_ISLE.x, z: REED_ISLE.z, r: 3 });

  // ── 5. 三面水鏡（之後的光路謎題）：鏡面朝湖心 ──
  MIRROR_PILLARS.forEach(([x, z], i) => {
    place(`mirrorlake_mirror_${pad2(i + 1)}`, 'mirror_pillar', x, z, { yaw: Math.atan2(MIRROR_TEMPLE.x - x, MIRROR_TEMPLE.z - z), r: 3 });
  });

  // ── 6. 區域 D：半沉沒的水鏡遺構（南岸），湖裡的半沉沒鐘樓 ──
  {
    const rand = mulberry32(9102);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.2;
      const r = MIRROR_RUINS.radius - 3 + rand() * 2;
      const x = MIRROR_RUINS.x + Math.cos(a) * r;
      const z = MIRROR_RUINS.z + Math.sin(a) * r;
      place(`mirrorlake_ruin_column_${pad2(i + 1)}`, i % 3 === 0 ? 'k_column' : 'k_column_broken', x, z, { scale: 2.6 + rand() * 0.8, yaw: rand() * 6.28, dy: -0.1, r: 1.2 });
    }
    place('mirrorlake_ruin_block_01', 'k_statue_block', MIRROR_RUINS.x - 5, MIRROR_RUINS.z + 6, { scale: 2.4, yaw: 0.4, r: 1.5 });
    place('mirrorlake_ruin_block_02', 'k_statue_block', MIRROR_RUINS.x + 7, MIRROR_RUINS.z + 4, { scale: 2, yaw: 1.3, dy: -0.3, r: 1.5 });
    place('mirrorlake_ruin_head', 'k_statue_head', MIRROR_RUINS.x + 3, MIRROR_RUINS.z + 9, { scale: 2.2, yaw: 2.6, r: 1.5 });
    taken.push({ x: MIRROR_RUINS.x, z: MIRROR_RUINS.z, r: MIRROR_RUINS.radius - 4 });
    place('mirrorlake_signpost_ruins', 'signpost_mirror_ruins', MIRROR_RUINS.x + 12, MIRROR_RUINS.z + 13, { yaw: Math.PI + 0.4, r: 1 });
  }
  place('mirrorlake_sunken_tower', 'sunken_tower', SUNKEN_BELL.x, SUNKEN_BELL.z, { yaw: 0.7, dy: -0.4, r: 3 });

  // ── 7. 區域 E：水鏡神殿（湖心島，之後的頭目戰場）──
  place('mirrorlake_temple', 'mirror_temple', MIRROR_TEMPLE.x, MIRROR_TEMPLE.z, { yaw: Math.PI / 2, dy: -0.32, r: MIRROR_TEMPLE.radius });

  // ── 8. 湖岸散佈 ──
  const half = MIRRORLAKE_SIZE / 2;
  const sr = mulberry32(9103);
  let scattered = 0;
  function scatter(opts: {
    prefix: string;
    count: number;
    prefabs: string[];
    spacing: number;
    scale: [number, number];
    /** 允許的地面高度（相對水面） */
    band: [number, number];
    area?: { x: number; z: number; r: number };
    trailClear?: number;
    maxSlope?: number;
    loose?: boolean;
    /** 浮在水面上（睡蓮） */
    float?: boolean;
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
      const h = height(x, z);
      if (h < WATER + opts.band[0] || h > WATER + opts.band[1]) continue;
      if (mirrorlakePathDistance(x, z) < MIRRORLAKE_TRAIL_HALF_WIDTH + (opts.trailClear ?? 1.4)) continue;
      if (shallowPathDistance(x, z) < SHALLOW_HALF_WIDTH + 0.8) continue;
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
        position: [round(x + O.x), round(opts.float ? WATER + 0.02 : h - 0.05), round(z + O.z)],
        rotation: [0, round(sr() * Math.PI * 2), 0],
        scale: [round(s), round(s * (0.9 + sr() * 0.25)), round(s)],
      });
    }
    if (placed < opts.count) console.warn(`scatter ${opts.prefix}: placed ${placed}/${opts.count}`);
  }
  // 岸上的樹（湖邊留出開闊的視野：離水面高 1.4 m 以上才種）
  scatter({ prefix: 'mirrorlake_tree', count: 230, prefabs: ['k_oak', 'k_tree_default', 'k_tree_fat', 'k_tree_detailed', 'k_pine_round_a', 'k_pine_round_c', 'k_tree_simple'], spacing: 3.4, scale: [6, 9.5], band: [2.2, 40], trailClear: 2.4 });
  scatter({ prefix: 'mirrorlake_bush', count: 110, prefabs: ['k_bush', 'k_bush_large', 'k_bush_detailed', 'k_bush_small'], spacing: 1.2, scale: [2.4, 4], band: [1.4, 40] });
  scatter({ prefix: 'mirrorlake_rock', count: 46, prefabs: ['k_rock_large_a', 'k_rock_large_b', 'k_rock_large_c', 'gm_stone_large_a', 'gm_stone_large_c'], spacing: 1.6, scale: [2, 3.6], band: [0.6, 40] });
  // 湖岸圓石：沙灘與淺水邊（Bible §7.3：平緩沙灘、圓石）
  scatter({ prefix: 'mirrorlake_shore_stone', count: 70, prefabs: ['gm_stone_small_a', 'gm_stone_small_c', 'pebble_d', 'pebble_e'], spacing: 1, scale: [2, 4], band: [-0.4, 0.9], loose: true, trailClear: 0.6 });
  // 蘆葦：水邊一圈，蘆葦島上特別密
  scatter({ prefix: 'mirrorlake_reed', count: 150, prefabs: ['lake_reeds'], spacing: 0.9, scale: [0.9, 1.4], band: [-0.55, 0.5], loose: true, trailClear: 0.8 });
  scatter({ prefix: 'mirrorlake_isle_reed', count: 46, prefabs: ['lake_reeds'], spacing: 0.7, scale: [1, 1.5], band: [-0.6, 1.2], area: { x: REED_ISLE.x, z: REED_ISLE.z, r: REED_ISLE.radius + 5 }, loose: true, trailClear: 0 });
  scatter({ prefix: 'mirrorlake_lily', count: 70, prefabs: ['k_lily_large', 'k_lily_small', 'water_lily'], spacing: 1.2, scale: [1.6, 2.6], band: [-2.4, -0.4], float: true, trailClear: 0 });
  scatter({ prefix: 'mirrorlake_grass', count: 120, prefabs: ['k_grass_large', 'k_grass_leafs'], spacing: 0.5, scale: [2.2, 3.6], band: [0.5, 40], loose: true, trailClear: 0.4 });

  // ── 9. 地圖邊界：迷霧牆外兩排樹 ──
  {
    const edgeRand = mulberry32(20261016);
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
        const s = 7 + edgeRand() * 4;
        const kind = edgeRand();
        push({
          id: `mirrorlake_edge_tree_${pad3(n)}`,
          prefabId: kind < 0.45 ? 'k_edge_oak' : kind < 0.75 ? 'k_edge_pine' : 'k_edge_cone',
          regionId: regionAt(x + O.x, z + O.z),
          position: [round(x + O.x), round(height(x, z) - 0.05), round(z + O.z)],
          rotation: [0, round(edgeRand() * Math.PI * 2), 0],
          scale: [round(s), round(s * (0.9 + edgeRand() * 0.25)), round(s)],
        });
      }
    }
    console.log(`placed ${n} mirrorlake boundary trees`);
  }

  // ── 10. 任務 9C：三處不自然的倒影（quest_lake_001）。附加在最後，只移除與它們重疊的散佈點綴 ──
  // 倒影裡的剪影（+Z 面）朝向玩家走來的方向：營地（西）、月弧木橋（北）、遺構的岸邊（南）
  const reflections: [string, string, number, number, number][] = [
    ['mirrorlake_reflection_camp', 'reflection_camp', -71, -3, -Math.PI / 2],
    ['mirrorlake_reflection_isle', 'reflection_isle', -2, -21, Math.PI],
    ['mirrorlake_reflection_ruins', 'reflection_ruins', 11, 69, 0],
  ];
  const scatterIds = /^mirrorlake_(tree|bush|rock|shore_stone|reed|isle_reed|lily|grass)_\d+$/;
  const kept = out.filter((o) => !scatterIds.test(o.id) || !reflections.some(([, , x, z]) => Math.hypot(o.position[0] - O.x - x, o.position[2] - O.z - z) < 2.6));
  console.log(`quest 9C: removed ${out.length - kept.length} scattered placements overlapping reflections`);
  for (const [id, prefabId, x, z, yaw] of reflections) {
    if (ids.has(id)) throw new Error(`placement id 重複：${id}`);
    ids.add(id);
    // 倒影浮在水面上（陸上的貼地）
    kept.push({ id, prefabId, regionId: regionAt(x + O.x, z + O.z), position: [round(x + O.x), round(Math.max(height(x, z), WATER) + 0.02), round(z + O.z)], rotation: [0, round(yaw), 0], scale: [1, 1, 1] });
  }

  placements.push(...kept);
  console.log(`added ${kept.length} mirrorlake placements (${scattered} scattered)`);
}
