// 地形高度函式。純函式，可同時供渲染、物理、資料產生腳本與日後伺服器使用。
// 只 import 同樣沒有 import 的地形檔（以 .ts 副檔名，資料產生腳本與端對端測試以 Node 直接執行）。
//
// 所有地圖在同一個物理世界（決策 T-117）：terrainHeight / distanceToPath 依世界座標分派到各地圖。
//
// 晨曦谷地（Bible §5.2，任務 7A）：約 320 × 320 m。座標慣例：-Z 為北、+X 為東。
// 中央是原本的垂直切片（出生點、晨曦村、晨露湖、霧林邊緣，座標不變），外圍加入：
// 北方的晨風高地（懸崖＋主路緩坡）、東側的碎光溪（兩處淺灘＋一座木橋）、西坊農田、
// 西南的望星丘、東南的古樹遺跡，以及外圍的起伏丘陵。

import { GLOWMOSS_ORIGIN, glowmossHeight, glowmossPathDistance, isInGlowmoss } from './glowmossTerrain.ts';
import { isInMirrorlake, MIRRORLAKE_ORIGIN, mirrorlakeHeight, mirrorlakePathDistance } from './mirrorlakeTerrain.ts';

export const TERRAIN_SIZE = 320;
/** 任務 7A 之前的地圖半寬（產生腳本保留舊散佈範圍，讓既有物件的 id 與位置不變） */
export const LEGACY_HALF_EXTENT = 74;
export const SPAWN_POINT = { x: 0, z: 18 } as const;
/** 小村莊中心（小路北段兩側）；周圍地形壓平以放置房屋 */
export const VILLAGE_CENTER = { x: -11, z: -34 } as const;
export const VILLAGE_RADIUS = 16;

/**
 * 湖泊與木橋（規格 5.1：湖泊與木橋 P0）：出生點東邊的湖，中央偏東有小島，西岸以木橋連到小島。
 * 水面高度全圖固定（湖與溪共用）；湖底與小島由 terrainHeight 一併產生（同一份函式供渲染與碰撞）。
 */
export const WATER_LEVEL = -1;
export const LAKE = { x: 34, z: 8, radius: 15 } as const;
export const ISLAND = { x: 37.5, z: 8, radius: 5 } as const;
const LAKE_BED = -4.2;
const ISLAND_TOP = 0.35;
/** 木橋：沿 X 軸從西岸到小島，橋面高度 deckY */
export const BRIDGE = { x: 25.5, z: 8, length: 14, deckY: 0.45 } as const;
/** 西岸橋頭壓平的範圍 */
const BRIDGE_BANK = { x: BRIDGE.x - BRIDGE.length / 2 - 1.5, z: BRIDGE.z, radius: 4.5 } as const;

export type Point2 = readonly [number, number];

/** 北方高地：懸崖線以北抬高；東側逐漸降回平地，讓溪流從東邊繞過 */
export const HIGHLAND = { height: 10, eastFadeFrom: 62, eastFadeTo: 92 } as const;
/** 懸崖線（z 值）：越往北（z 越小）越高 */
export function cliffZ(x: number): number {
  return -100 + Math.sin(x * 0.05 + 0.6) * 5 + Math.sin(x * 0.13) * 3;
}

/** 碎光溪：由北往南流過地圖東側（折線，水面同湖面高度） */
export const RIVER_PATH: readonly Point2[] = [
  [126, -170],
  [118, -122],
  [104, -92],
  [108, -58],
  [98, -24],
  [100, 0],
  [106, 30],
  [96, 62],
  [100, 96],
  [92, 130],
  [96, 170],
];
export const RIVER_HALF_WIDTH = 4.5;
const RIVER_BED = -3;
/** 淺灘：溪床抬到水面下 0.3 m，可以涉水走過 */
export const RIVER_FORDS: readonly { x: number; z: number }[] = [
  { x: 107, z: -55 },
  { x: 97, z: 64 },
];
const FORD_BED = WATER_LEVEL - 0.3;
/** 溪上的木橋（東西向，與湖邊木橋同一個模型與尺寸） */
export const RIVER_BRIDGE = { x: 100, z: -1, length: BRIDGE.length, deckY: BRIDGE.deckY } as const;

/** 平台（整平的區域）：農田、遺跡、燈塔 */
type Pad = { x: number; z: number; radius: number; falloff: number; height: number };
export const FARMLAND = { x: -86, z: -28, radius: 24 } as const;
export const RUINS = { x: 60, z: 104, radius: 15 } as const;
export const LIGHTHOUSE = { x: -34, z: -126 } as const;
const PADS: readonly Pad[] = [
  { ...FARMLAND, falloff: 12, height: 0.4 },
  { ...RUINS, falloff: 10, height: 1.2 },
  { x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, radius: 9, falloff: 8, height: HIGHLAND.height + 1.5 },
];

/** 山丘：高斯形狀的隆起（望星丘最高） */
export const OVERLOOK_HILL = { x: -88, z: 92, height: 15, radius: 19 } as const;
const HILLS: readonly { x: number; z: number; height: number; radius: number }[] = [
  OVERLOOK_HILL,
  { x: -128, z: 40, height: 7, radius: 16 },
  { x: -60, z: 128, height: 5, radius: 14 },
  { x: 134, z: 70, height: 6, radius: 14 },
  { x: 136, z: -40, height: 8, radius: 16 },
  { x: 30, z: 132, height: 4, radius: 12 },
  { x: -126, z: -104, height: 5, radius: 14 },
];

/** 草原小路：由出生點往北延伸的 S 形曲線，回傳該 z 對應的路中心 x。 */
export function pathCenterX(z: number): number {
  return Math.sin(z * 0.045) * 9 + Math.sin(z * 0.11 + 1.3) * 2.5;
}
/** 主路南北兩端（北端在高地上，往西接燈塔的支線） */
export const MAIN_ROAD_NORTH = -112;
export const MAIN_ROAD_SOUTH = 146;

/** 主路以外的支線（折線）：村莊 → 農田、湖北岸 → 溪橋 → 東邊、往望星丘、往遺跡、高地 → 燈塔 */
export const BRANCH_ROADS: readonly (readonly Point2[])[] = [
  [
    [pathCenterX(-8), -8],
    [-20, -6],
    [-42, -8],
    [-60, -22],
    [-76, -28],
  ],
  [
    [pathCenterX(0), 0],
    [14, -12],
    [34, -15],
    [52, -10],
    [70, -4],
    [RIVER_BRIDGE.x - RIVER_BRIDGE.length / 2 - 2, RIVER_BRIDGE.z],
  ],
  [
    [RIVER_BRIDGE.x + RIVER_BRIDGE.length / 2 + 2, RIVER_BRIDGE.z],
    [122, 3],
    [142, 8],
  ],
  [
    [pathCenterX(40), 40],
    [-10, 50],
    [-35, 62],
    [-58, 76],
    [-74, 86],
    [-84, 91],
  ],
  [
    [pathCenterX(70), 70],
    [18, 80],
    [38, 92],
    [52, 100],
  ],
  [
    [pathCenterX(MAIN_ROAD_NORTH), MAIN_ROAD_NORTH],
    [-5, -120],
    [-22, -125],
    [LIGHTHOUSE.x + 5, LIGHTHOUSE.z],
  ],
];

export const PATH_HALF_WIDTH = 1.8;

/** 點到線段的水平距離 */
function segmentDistance(x: number, z: number, a: Point2, b: Point2): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - a[0]) * dx + (z - a[1]) * dz) / len2)) : 0;
  return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
}

/** 點到折線的水平距離 */
export function polylineDistance(x: number, z: number, line: readonly Point2[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) best = Math.min(best, segmentDistance(x, z, line[i]!, line[i + 1]!));
  return best;
}

/** 距離主路中心的水平距離（主路只在南北兩端之間） */
export function distanceToMainRoad(x: number, z: number): number {
  if (z < MAIN_ROAD_NORTH) return Math.hypot(x - pathCenterX(MAIN_ROAD_NORTH), z - MAIN_ROAD_NORTH);
  if (z > MAIN_ROAD_SOUTH) return Math.hypot(x - pathCenterX(MAIN_ROAD_SOUTH), z - MAIN_ROAD_SOUTH);
  return Math.abs(x - pathCenterX(z));
}

/** 距離最近道路中心的水平距離（世界座標，依所在地圖分派）。 */
export function distanceToPath(x: number, z: number): number {
  if (isInGlowmoss(x, z)) return glowmossPathDistance(x - GLOWMOSS_ORIGIN.x, z - GLOWMOSS_ORIGIN.z);
  if (isInMirrorlake(x, z)) return mirrorlakePathDistance(x - MIRRORLAKE_ORIGIN.x, z - MIRRORLAKE_ORIGIN.z);
  return dawnvalePathDistance(x, z);
}

/** 晨曦谷地：距離最近道路（主路或支線）中心的水平距離。 */
function dawnvalePathDistance(x: number, z: number): number {
  let d = distanceToMainRoad(x, z);
  for (const road of BRANCH_ROADS) {
    if (d < 0.5) break;
    d = Math.min(d, polylineDistance(x, z, road));
  }
  return d;
}

/** 距離溪流中心線的水平距離 */
export function distanceToRiver(x: number, z: number): number {
  return polylineDistance(x, z, RIVER_PATH);
}

/** 一般地形的柔和下限（見 terrainHeight） */
const BASE_FLOOR = 0;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** 高地的權重（0 = 低地、1 = 高地頂面）；主路附近的過渡拉長成緩坡，其他地方是陡峭的懸崖 */
export function highlandWeight(x: number, z: number): number {
  const east = 1 - smoothstep(HIGHLAND.eastFadeFrom, HIGHLAND.eastFadeTo, x);
  if (east <= 0) return 0;
  const width = 3 + 30 * (1 - smoothstep(4, 14, distanceToMainRoad(x, z)));
  const c = cliffZ(x);
  return smoothstep(c + width / 2, c - width / 2, z) * east;
}

/** 地面高度（世界座標，依所在地圖分派）。 */
export function terrainHeight(x: number, z: number): number {
  if (isInGlowmoss(x, z)) return glowmossHeight(x - GLOWMOSS_ORIGIN.x, z - GLOWMOSS_ORIGIN.z);
  if (isInMirrorlake(x, z)) return mirrorlakeHeight(x - MIRRORLAKE_ORIGIN.x, z - MIRRORLAKE_ORIGIN.z);
  return dawnvaleHeight(x, z);
}

/**
 * 晨曦谷地：柔和起伏的草原高度。
 * - 出生點周圍壓平，方便教學；村莊周圍壓平，房屋不會懸空或陷入坡面。
 * - 小路略為下凹。
 * - 外圍有較大的丘陵起伏；地圖最外緣抬升，作為自然邊界（迷霧牆外）。
 */
export function dawnvaleHeight(x: number, z: number): number {
  const rolling =
    Math.sin(x * 0.06) * Math.cos(z * 0.05) * 1.6 +
    Math.sin(x * 0.13 + 2.1) * Math.sin(z * 0.11 + 0.7) * 0.7 +
    Math.sin((x + z) * 0.031) * 1.1;

  const spawnDist = Math.hypot(x - SPAWN_POINT.x, z - SPAWN_POINT.z);
  const spawnFlatten = smoothstep(6, 18, spawnDist);
  const villageDist = Math.hypot(x - VILLAGE_CENTER.x, z - VILLAGE_CENTER.z);
  const villageFlatten = smoothstep(VILLAGE_RADIUS, VILLAGE_RADIUS + 10, villageDist);

  const roadDist = dawnvalePathDistance(x, z);
  const pathDip = 1 - smoothstep(PATH_HALF_WIDTH * 0.6, PATH_HALF_WIDTH * 2.2, roadDist);

  // 外圍（舊地圖範圍以外）較大的起伏
  const outer = smoothstep(70, 100, Math.max(Math.abs(x), Math.abs(z)));
  const broad = (Math.sin(x * 0.021 + 1) * Math.cos(z * 0.017 + 0.4) * 2.2 + Math.sin(x * 0.047 - z * 0.039) * 0.9) * outer;

  const edge = Math.max(Math.abs(x), Math.abs(z)) / (TERRAIN_SIZE / 2);
  const rim = smoothstep(0.8, 1, edge) * 12;

  // 起伏的低處以柔和的下限托住：只有湖與溪會低於水面，草原上不會冒出積水的窪地
  let base = (rolling + broad) * spawnFlatten * villageFlatten;
  if (base < BASE_FLOOR) base = BASE_FLOOR - (BASE_FLOOR - base) * 0.08;
  let h = base - pathDip * 0.25 + rim;

  for (const hill of HILLS) {
    const d = Math.hypot(x - hill.x, z - hill.z) / hill.radius;
    if (d < 3) h += hill.height * Math.exp(-d * d);
  }

  // 高地：懸崖以北整體抬高（道路下凹保留，形成上坡的路面）
  h += highlandWeight(x, z) * HIGHLAND.height;

  // 平台：整平到固定高度
  for (const pad of PADS) {
    const w = 1 - smoothstep(pad.radius, pad.radius + pad.falloff, Math.hypot(x - pad.x, z - pad.z));
    if (w > 0) h += (pad.height - pathDip * 0.2 - h) * w;
  }

  // 碎光溪：河道下切到溪床，兩岸緩坡；淺灘抬高溪床
  const riverDist = distanceToRiver(x, z);
  if (riverDist < RIVER_HALF_WIDTH + 8) {
    let bed = RIVER_BED;
    for (const f of RIVER_FORDS) {
      const fw = 1 - smoothstep(3, 7, Math.hypot(x - f.x, z - f.z));
      bed += (FORD_BED - bed) * fw;
    }
    const rw = 1 - smoothstep(RIVER_HALF_WIDTH - 1.5, RIVER_HALF_WIDTH + 6, riverDist);
    h += (bed - h) * rw;
  }

  // 橋頭壓平到橋面高度，走上橋不會有落差（湖邊木橋西岸、溪橋兩岸）
  const bankW = 1 - smoothstep(BRIDGE_BANK.radius, BRIDGE_BANK.radius + 4, Math.hypot(x - BRIDGE_BANK.x, z - BRIDGE_BANK.z));
  h += (BRIDGE.deckY - 0.08 - h) * bankW;
  for (const side of [-1, 1]) {
    const bx = RIVER_BRIDGE.x + side * (RIVER_BRIDGE.length / 2 + 1.5);
    const w = 1 - smoothstep(3, 6.5, Math.hypot(x - bx, z - RIVER_BRIDGE.z));
    h += (RIVER_BRIDGE.deckY - 0.08 - h) * w;
  }
  // 湖：岸邊緩坡往下到湖底
  const lakeW = 1 - smoothstep(LAKE.radius - 6, LAKE.radius + 1, Math.hypot(x - LAKE.x, z - LAKE.z));
  h += (LAKE_BED - h) * lakeW;
  // 小島：平坦的頂面（Phase 4 的家園預定地）
  const islandW = 1 - smoothstep(ISLAND.radius, ISLAND.radius + 3.5, Math.hypot(x - ISLAND.x, z - ISLAND.z));
  h += (ISLAND_TOP - h) * islandW;
  return h;
}

/** 地面低於水面（在湖或溪裡） */
export function isUnderwater(x: number, z: number, margin = 0): boolean {
  return terrainHeight(x, z) < WATER_LEVEL + margin;
}
