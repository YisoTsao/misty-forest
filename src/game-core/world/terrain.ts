// 地形高度函式。純函式、無 import，可同時供渲染、物理、資料產生腳本與日後伺服器使用。

export const TERRAIN_SIZE = 160;
export const SPAWN_POINT = { x: 0, z: 18 } as const;
/** 小村莊中心（小路北段兩側）；周圍地形壓平以放置房屋 */
export const VILLAGE_CENTER = { x: -11, z: -34 } as const;
export const VILLAGE_RADIUS = 16;

/**
 * 湖泊與木橋（規格 5.1：湖泊與木橋 P0）：出生點東邊的湖，中央偏東有小島，西岸以木橋連到小島。
 * 湖面高度固定；湖底與小島由 terrainHeight 一併產生（同一份函式供渲染與碰撞）。
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

/** 草原小路：由出生點往北延伸的 S 形曲線，回傳該 z 對應的路中心 x。 */
export function pathCenterX(z: number): number {
  return Math.sin(z * 0.045) * 9 + Math.sin(z * 0.11 + 1.3) * 2.5;
}

export const PATH_HALF_WIDTH = 1.8;

/** 距離小路中心的水平距離。 */
export function distanceToPath(x: number, z: number): number {
  return Math.abs(x - pathCenterX(z));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * 柔和起伏的草原高度。
 * - 出生點周圍壓平，方便教學；村莊周圍壓平，房屋不會懸空或陷入坡面。
 * - 小路略為下凹。
 * - 地圖邊緣抬升成丘陵，作為自然邊界。
 */
export function terrainHeight(x: number, z: number): number {
  const rolling =
    Math.sin(x * 0.06) * Math.cos(z * 0.05) * 1.6 +
    Math.sin(x * 0.13 + 2.1) * Math.sin(z * 0.11 + 0.7) * 0.7 +
    Math.sin((x + z) * 0.031) * 1.1;

  const spawnDist = Math.hypot(x - SPAWN_POINT.x, z - SPAWN_POINT.z);
  const spawnFlatten = smoothstep(6, 18, spawnDist);
  const villageDist = Math.hypot(x - VILLAGE_CENTER.x, z - VILLAGE_CENTER.z);
  const villageFlatten = smoothstep(VILLAGE_RADIUS, VILLAGE_RADIUS + 10, villageDist);

  const pathDip = 1 - smoothstep(PATH_HALF_WIDTH * 0.6, PATH_HALF_WIDTH * 2.2, distanceToPath(x, z));

  const edge = Math.max(Math.abs(x), Math.abs(z)) / (TERRAIN_SIZE / 2);
  const rim = smoothstep(0.6, 1, edge) * 9;

  let h = rolling * spawnFlatten * villageFlatten - pathDip * 0.25 + rim;

  // 西岸橋頭壓平到橋面高度，走上橋不會有落差
  const bankW = 1 - smoothstep(BRIDGE_BANK.radius, BRIDGE_BANK.radius + 4, Math.hypot(x - BRIDGE_BANK.x, z - BRIDGE_BANK.z));
  h += (BRIDGE.deckY - 0.08 - h) * bankW;
  // 湖：岸邊緩坡往下到湖底
  const lakeW = 1 - smoothstep(LAKE.radius - 6, LAKE.radius + 1, Math.hypot(x - LAKE.x, z - LAKE.z));
  h += (LAKE_BED - h) * lakeW;
  // 小島：平坦的頂面（Phase 4 的家園預定地）
  const islandW = 1 - smoothstep(ISLAND.radius, ISLAND.radius + 3.5, Math.hypot(x - ISLAND.x, z - ISLAND.z));
  h += (ISLAND_TOP - h) * islandW;
  return h;
}

/** 地面低於湖面（在水裡） */
export function isUnderwater(x: number, z: number, margin = 0): boolean {
  return terrainHeight(x, z) < WATER_LEVEL + margin;
}
