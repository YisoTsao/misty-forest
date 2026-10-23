// 螢苔祕林（第二章，Bible §6.3；任務 12B）的 placement。由 gen-placements.ts 在晨曦谷地之後呼叫。
// 地圖在世界座標 GLOWMOSS_ORIGIN（決策 T-117），這裡以局部座標配置後加上原點。
// 12B 只細緻佈置 A 迷霧入口與 B 螢苔花園（規格 Phase 1 垂直切片）；C–G 先有地形與一般的森林散佈，之後的任務再佈置。
// 晨曦谷地這一側只加入林道入口與路標。全部使用獨立的固定種子，結果可重現。
import { readFileSync } from 'node:fs';
import { mulberry32 } from '../src/game-core/util/random.ts';
import { boundaryDistance, boundaryOutline } from '../src/game-core/world/bounds.ts';
import {
  ANCIENT_ALTAR,
  CREEK_FALLS,
  CRYSTAL_GROTTO,
  GLOW_GARDEN,
  GLOWMOSS_ARRIVAL,
  GLOWMOSS_ORIGIN,
  GLOWMOSS_SIZE,
  GLOWMOSS_TRAILS,
  glowmossHeight,
  glowmossPathDistance,
  MIST_ARCH,
  MUSHROOM_VILLAGE,
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

/** 與 game-core 的 regionAt 相同規則（權重最大、同權重取範圍較小者；預設為螢苔花園）；世界座標 */
function regionAt(x: number, z: number): string {
  let best = 'glow_garden';
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

/** 把模型的 X 軸對齊到與方向 (dx, dz) 垂直（拱門橫跨小徑） */
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

/** 迷霧入口的第一個寶箱：石拱門北側、小徑旁的樹根凹處（看得到但要離開小徑幾步） */
const FIRST_CHEST = { x: -104, z: -9 } as const;
/** 花園周圍的巨型蘑菇（角度、離中心的距離、大小）：南側與東側留出視線，從入口看得到花園深處 */
const GARDEN_GIANTS: readonly [number, number, number][] = [
  [-2.5, 28, 0.95],
  [-1.85, 31, 0.8],
  [-1.15, 29, 1.05],
  [-0.45, 31, 0.78],
  [0.35, 29, 0.85],
  [1.1, 28, 0.9],
  [1.75, 31, 1.0],
  [2.45, 28, 0.82],
];
/** 不放散佈點綴的範圍：聚落台地（之後放房屋）、祭壇高台、祕窟窪地 */
const RESERVED: readonly { x: number; z: number; r: number }[] = [
  { x: MUSHROOM_VILLAGE.x, z: MUSHROOM_VILLAGE.z, r: MUSHROOM_VILLAGE.radius + 2 },
  { x: ANCIENT_ALTAR.x, z: ANCIENT_ALTAR.z, r: ANCIENT_ALTAR.radius + 2 },
  { x: CRYSTAL_GROTTO.x, z: CRYSTAL_GROTTO.z, r: CRYSTAL_GROTTO.radius + 1 },
  { x: CREEK_FALLS.x, z: CREEK_FALLS.z, r: 8 },
  // 從石拱門望向花園的視線（不放樹）
  { x: -100, z: 3, r: 4 },
  { x: -91, z: 4, r: 4 },
];

export function addGlowmoss(placements: Out[]): void {
  const out: Out[] = [];
  const taken: Taken[] = [...RESERVED];
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

  // ── 2. A 迷霧入口：林道入口（回晨曦谷地）、破損的路牌、石拱門、第一個寶箱 ──
  place('glowmoss_gate_dawnvale', 'gate_to_dawnvale', GLOWMOSS_ARRIVAL.x - 6, GLOWMOSS_ARRIVAL.z, { yaw: Math.PI / 2, r: 6 });
  taken.push({ x: GLOWMOSS_ARRIVAL.x, z: GLOWMOSS_ARRIVAL.z, r: 7 });
  place('glowmoss_signpost_broken', 'signpost_broken', GLOWMOSS_ARRIVAL.x + 6, GLOWMOSS_ARRIVAL.z + 4.2, { yaw: -Math.PI / 2 + 0.5, r: 1.4 });
  {
    const [dx, dz] = directionNear(GLOWMOSS_TRAILS[0]!, MIST_ARCH.x, MIST_ARCH.z);
    place('glowmoss_mist_arch', 'mist_arch', MIST_ARCH.x, MIST_ARCH.z, { yaw: yawAcross(dx, dz), dy: -0.1, r: 4.5 });
  }
  // 拱門兩側的立石與苔蘚
  for (const side of [-1, 1]) {
    place(`glowmoss_arch_stone_${side < 0 ? 'n' : 's'}`, 'gm_stone_large_c', MIST_ARCH.x + 1.5, MIST_ARCH.z + side * 5.4, { scale: 2.4, yaw: side, r: 1.5 });
    place(`glowmoss_arch_moss_${side < 0 ? 'n' : 's'}`, 'glowmoss_patch', MIST_ARCH.x - 1, MIST_ARCH.z + side * 4.2, { scale: 1.2, yaw: side * 0.7 });
  }
  place('glowmoss_first_chest', 'chest_glowmoss', FIRST_CHEST.x, FIRST_CHEST.z, { yaw: Math.atan2(-2, 9), r: 2 });
  place('glowmoss_first_chest_root', 'root_arch', FIRST_CHEST.x - 0.6, FIRST_CHEST.z - 2.4, { yaw: 0.2, scale: 0.7, dy: -0.2, r: 2.5 });
  place('glowmoss_first_chest_mushroom', 'k_mushroom_red', FIRST_CHEST.x + 1.6, FIRST_CHEST.z + 0.6, { scale: 3.4, yaw: 1.2 });
  // 第一座星光燈柱（規格 P-01）：拱門後方、小徑南側，走過去就看得見；純淨螢苔採集點在入口與小徑旁
  place('glowmoss_star_lamp_01', 'star_lamp', -99, 8, { yaw: Math.PI / 2, r: 1.2 });
  place('glowmoss_pure_node_01', 'glowmoss_node', -124, 8, { yaw: 0.6, r: 1 });
  place('glowmoss_pure_node_02', 'glowmoss_node', -98, -5, { yaw: 2.1, r: 1 });
  // P-01 另外兩座星光燈柱（規格 9.1：入口與花園共三座）：花園一座、入口北側一座，各有一叢純淨螢苔；
  // 入口一開始是濃霧、花園是淡霧，每座都讓所在區域的霧降一段。不佔散佈的位置，選在原本空著的地方
  place('glowmoss_star_lamp_02', 'star_lamp', -70, -6, { yaw: 0.4 });
  place('glowmoss_pure_node_03', 'glowmoss_node', -66, -10, { yaw: 1.1 });
  place('glowmoss_star_lamp_03', 'star_lamp', -126, 16, { yaw: Math.PI / 2 });
  place('glowmoss_pure_node_04', 'glowmoss_node', -122, 19, { yaw: 2.7 });
  // 支線 CH2-SQ-02 螢火蟲回家：三隻失散的螢靈躲在 A 入口、B 花園、C 溪谷的小蘑菇下
  place('lost_firefly_01', 'lost_firefly', -118, -12, { yaw: 0.4, r: 1 });
  place('lost_firefly_02', 'lost_firefly', -44, 24, { yaw: 1.8, r: 1 });
  place('lost_firefly_03', 'lost_firefly', -34, -96, { yaw: 2.6, r: 1 });
  // 支線 CH2-SQ-04 不會說謊的石碑：花園北邊的星盤遺跡（三塊星盤由西往東排、盤面朝南，從南邊的石碑看過去）
  // 轉軸是模型的 X 軸，朝向 π/2 時指向北方；每轉一格星轉 90°：0 朝上、1 朝東、2 朝下、3 朝西；石碑的答案是西、下、東（3、2、1）
  // 不加入 taken（r）：佔位會讓之後的散佈亂數整串錯開；位置選在原本就沒有樹與石頭的空地
  for (const [i, x] of [-80, -76, -72].entries()) {
    place(`star_dial_base_0${i + 1}`, 'star_dial_base', x, -24, { yaw: Math.PI / 2 });
    place(`star_dial_0${i + 1}`, 'star_dial', x, -24, { yaw: Math.PI / 2, dy: 1.35 });
  }
  place('star_tablet', 'star_tablet', -76, -19, { yaw: Math.PI });

  // ── 2b. C 倒流溪谷（規格 P-02）：三座水輪在溪岸（答案在石碑上）、石障擋住溪谷往上游的路、石碑讀得到 ──
  place('creek_wheel_01', 'waterwheel', -44, -56, { yaw: Math.PI / 2, r: 2.5 });
  place('creek_wheel_frame_01', 'waterwheel_frame', -44, -56, { yaw: Math.PI / 2 });
  place('creek_wheel_02', 'waterwheel', -34, -70, { yaw: Math.PI / 2, r: 2.5 });
  place('creek_wheel_frame_02', 'waterwheel_frame', -34, -70, { yaw: Math.PI / 2 });
  place('creek_wheel_03', 'waterwheel', -44, -86, { yaw: Math.PI / 2, r: 2.5 });
  place('creek_wheel_frame_03', 'waterwheel_frame', -44, -86, { yaw: Math.PI / 2 });
  place('creek_barrier', 'creek_barrier', -20, -102, { yaw: Math.PI / 2, r: 4 });
  place('creek_tablet', 'creek_tablet', -30, -60, { yaw: 0.6, r: 1.2 });
  // 支線 CH2-SQ-01 會發光的晚餐：溪谷的蘆葦淺灘（撈溪魚）；不佔散佈的位置，選在原本空著的地方
  place('creek_fish_spot_01', 'creek_fish_spot', -34, -50, { yaw: 0.3 });
  place('creek_fish_spot_02', 'creek_fish_spot', -26, -80, { yaw: 1.9 });
  place('creek_fish_spot_03', 'creek_fish_spot', -24, -92, { yaw: 3.4 });

  // ── 2c. C 星晶祕窟（規格 P-03）：祕窟內三面星晶鏡、東南面的星光石門（隱藏入口）、寶箱與石碑 ──
  // 光路（lightPaths.json）：光源 → 鏡 1 → 鏡 2 → 鏡 3 → 石門；每面鏡子轉到朝向下一個目標（4 個方向）
  // 局部座標（世界 − (2000, 0)）：祕窟中心 (20, −124)；答案是鏡 1 轉 2 格、鏡 2 轉 1 格、鏡 3 轉 1 格
  place('crystal_mirror_01', 'crystal_mirror', 10, -124, { r: 1.5 });
  place('crystal_mirror_02', 'crystal_mirror', 10, -136, { r: 1.5 });
  place('crystal_mirror_03', 'crystal_mirror', 24, -136, { r: 1.5 });
  // 石門在環狀山脊的開口上（半徑 26），面向祕窟中心
  place('crystal_gate', 'crystal_gate', 43.6, -134.9, { yaw: Math.atan2(-12, 26) + Math.PI / 2, r: 2 });
  // 污染根瘤（規格 P-06 / §5.2）：深層的紫色根，用一顆純淨螢苔淨化；隱藏的寶箱（需要照明）藏在花園的石頭後面
  place('corruption_root_01', 'corruption_root', 50, 74, { yaw: 0.4, r: 2.5 });
  place('corruption_root_02', 'corruption_root', 62, 108, { yaw: 2.2, r: 2.5 });
  // 支線 CH2-SQ-03 商人的失物：托托的貨箱掉在森林狼出沒的地方
  place('toto_crate_01', 'toto_crate', 38, 100, { yaw: 0.7, scale: 4.5, r: 1.6 });
  place('hidden_cache_01', 'hidden_cache', -60, -18, { yaw: 2.4, r: 2 });
  // 支線 CH2-SQ-05 被遺忘的花園：迷霧入口北邊的舊木盒（需要星光照明）；不佔散佈的位置，選在原本空著的地方
  place('seed_cache_01', 'seed_cache', -104, -20, { yaw: 0.9 });
  // 寶箱與石碑放在祕窟中央較平的地面（高度 0.4），不在光路上
  place('crystal_chest', 'crystal_chest', 16, -120, { yaw: 0.9, r: 2 });
  place('crystal_tablet', 'crystal_tablet', 26, -118, { yaw: 3.0, r: 1.2 });

  // ── 2e. D 蘑菇居民聚落（規格 4.2 D）：幾間小屋、公告板；菇菇婆婆在聚落中央（NPC 位置在 npcs.json）──
  place('village_house_01', 'house_small_yellow', 34, -6, { yaw: 0.6, r: 4 });
  place('village_house_02', 'house_small_blue', 46, 10, { yaw: -0.8, r: 4 });
  place('village_house_03', 'house_small_red', 22, 16, { yaw: 2.2, r: 4 });
  place('village_board', 'notice_board', 30, 2, { yaw: 1.4, r: 1.2 });

  // ── 2d. 古樹祭壇（規格 G、B-01）：三座共鳴石柱環繞戰場（淨化用），祭壇中心是古樹 ──
  // 戰場中心 (112, 0)（局部座標，世界 2112, 0）；石柱在半徑 8 的圓上
  place('altar_resonance_01', 'altar_resonance', 120, 0, { r: 1.2 });
  place('altar_resonance_02', 'altar_resonance', 108, 6.93, { r: 1.2 });
  place('altar_resonance_03', 'altar_resonance', 108, -6.93, { r: 1.2 });
  // CH2-MQ-08：古樹核心的記憶（淨化後在祭壇觀看，接著往澄鏡湖的出口）
  place('ancient_memory_01', 'ancient_memory', 104, 0, { yaw: -Math.PI / 2, r: 1.2 });

  // ── 3. B 螢苔花園：周圍的巨型蘑菇、發光立石、螢光花、樹根拱門 ──
  GARDEN_GIANTS.forEach(([a, r, s], i) => {
    const x = GLOW_GARDEN.x + Math.cos(a) * r;
    const z = GLOW_GARDEN.z + Math.sin(a) * r;
    if (glowmossPathDistance(x, z) < TRAIL_HALF_WIDTH + 5) return;
    place(`glowmoss_garden_giant_${pad2(i + 1)}`, 'giant_mushroom', x, z, { scale: s, yaw: a * 1.7, r: 9 * s + 1 });
  });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    const x = GLOW_GARDEN.x + Math.cos(a) * 9;
    const z = GLOW_GARDEN.z + Math.sin(a) * 9;
    if (glowmossPathDistance(x, z) < TRAIL_HALF_WIDTH + 1.5) continue;
    // 符紋（+Z 面）朝向花園中心
    place(`glowmoss_garden_stone_${pad2(i + 1)}`, 'glow_stone', x, z, { yaw: Math.atan2(GLOW_GARDEN.x - x, GLOW_GARDEN.z - z), scale: 0.9 + (i % 2) * 0.2, r: 1.2 });
  }
  // 花園入口（西側）的發光樹根拱門
  {
    const at: [number, number] = [-80, 5];
    const [dx, dz] = directionNear(GLOWMOSS_TRAILS[0]!, at[0], at[1]);
    place('glowmoss_garden_root_arch', 'root_arch', at[0], at[1], { yaw: yawAcross(dx, dz), scale: 1.1, dy: -0.15, r: 3.5 });
  }

  // ── 4. 散佈 ──
  const sr = mulberry32(20261020);
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
  const inGarden = (x: number, z: number) => Math.hypot(x - GLOW_GARDEN.x, z - GLOW_GARDEN.z) < GLOW_GARDEN.radius + 4;
  const garden = { x: GLOW_GARDEN.x, z: GLOW_GARDEN.z, r: GLOW_GARDEN.radius + 2 };
  const entrance = { x: -118, z: 2, r: 22 };

  // 花園裡的發光植物（Bible §6.4：發光只用於螢苔、蘑菇與星晶，有限度）與可採集的螢苔、月露草
  scatter({ prefix: 'glowmoss_flowers', count: 46, prefabs: ['glow_flowers'], spacing: 1.2, scale: [1.6, 2.6], area: garden, trailClear: 0.6, loose: true });
  scatter({ prefix: 'glowmoss_moss', count: 60, prefabs: ['glowmoss_patch'], spacing: 1.2, scale: [1, 2.2], area: garden, trailClear: 0.6, loose: true });
  scatter({ prefix: 'glowmoss_glowcap', count: 30, prefabs: ['glow_mushrooms'], spacing: 1, scale: [1.6, 2.6], area: garden, loose: true });
  scatter({ prefix: 'glowmoss_tuft', count: 16, prefabs: ['glowmoss_tuft'], spacing: 2.2, scale: [1.6, 1.9], area: garden, trailClear: 1 });
  scatter({ prefix: 'glowmoss_moondew', count: 10, prefabs: ['moondew'], spacing: 2.5, scale: [1.6, 1.9], area: garden, trailClear: 1 });
  scatter({ prefix: 'glowmoss_moondew_decor', count: 22, prefabs: ['moondew_decor'], spacing: 0.8, scale: [1.4, 1.8], area: garden, loose: true });
  // 迷霧入口：淺綠的林地、粉紅蘑菇、少量螢苔（參考圖 A：淺綠森林、淡藍霧氣）
  scatter({ prefix: 'glowmoss_entry_tuft', count: 5, prefabs: ['glowmoss_tuft'], spacing: 2.4, scale: [1.6, 1.9], area: entrance, trailClear: 1.2 });
  scatter({ prefix: 'glowmoss_entry_mushroom', count: 26, prefabs: ['k_mushroom_red', 'k_mushroom_group', 'k_mushroom_tan'], spacing: 0.6, scale: [2.6, 4.2], area: entrance, loose: true });

  // 樹木：花園盆地裡不放，留出開闊的空地
  const notGarden = (x: number, z: number) => !inGarden(x, z);
  scatter({
    prefix: 'glowmoss_giant_tree',
    count: 40,
    prefabs: ['gm_tree_oak', 'gm_tree_fat', 'gm_tree_detailed'],
    spacing: 6,
    scale: [12, 16],
    trailClear: 5,
    where: (x, z) => notGarden(x, z) && Math.hypot(x - entrance.x, z - entrance.z) > entrance.r,
  });
  scatter({
    prefix: 'glowmoss_tree',
    count: 430,
    prefabs: ['gm_tree_oak', 'gm_tree_default', 'gm_tree_detailed', 'gm_tree_fat', 'gm_tree_plateau', 'gm_tree_thin', 'gm_tree_simple', 'k_tree_tall_dark', 'k_tree_cone_dark'],
    spacing: 3.1,
    scale: [6.5, 10.5],
    trailClear: 2.2,
    where: notGarden,
  });
  scatter({ prefix: 'glowmoss_bush', count: 140, prefabs: ['k_bush', 'k_bush_large', 'k_bush_detailed', 'k_bush_small'], spacing: 1.2, scale: [2.5, 4.2], where: notGarden });
  scatter({ prefix: 'glowmoss_fern', count: 520, prefabs: ['gm_fern_short', 'gm_fern_tall', 'gm_fern_tall'], spacing: 0.4, scale: [2.8, 5], loose: true, trailClear: 0.4 });
  scatter({ prefix: 'glowmoss_mushroom', count: 150, prefabs: ['gm_mushroom_tan', 'gm_mushroom_tan_tall', 'k_mushroom_red', 'k_mushroom_group', 'k_mushroom_tan'], spacing: 0.5, scale: [2.6, 5], loose: true });
  scatter({ prefix: 'glowmoss_stone', count: 44, prefabs: ['gm_stone_large_a', 'gm_stone_large_c', 'k_rock_large_a', 'k_rock_large_b'], spacing: 1.8, scale: [2.2, 4.2], where: notGarden });
  scatter({ prefix: 'glowmoss_pebble', count: 22, prefabs: ['gm_stone_small_a', 'gm_stone_small_c'], spacing: 1, scale: [3, 4.5] });
  scatter({ prefix: 'glowmoss_log', count: 26, prefabs: ['k_log_large', 'k_log'], spacing: 2, scale: [2.6, 4], where: notGarden, maxSlope: 0.4 });
  scatter({ prefix: 'glowmoss_stump', count: 24, prefabs: ['k_stump_old', 'k_stump_old_tall'], spacing: 1.4, scale: [2.4, 3.6], where: notGarden });

  // ── 5. 地圖邊界：迷霧牆外兩排暗色的大樹 ──
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
