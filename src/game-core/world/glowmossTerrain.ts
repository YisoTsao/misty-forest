// 螢苔祕林（Bible §6，任務 8A）的地形高度。純函式、無 import（資料產生腳本以 Node 直接執行）。
//
// 座標為地圖的局部座標（地圖原點見 GLOWMOSS_ORIGIN），慣例與晨曦谷地相同：-Z 為北、+X 為東。
// 地圖與晨曦谷地放在同一個物理世界的遠處（決策 T-117），可玩區同為 ±148 m。
// - 西側「林緣小徑」：從晨曦谷地過來的入口，巨大樹根與採藥點。
// - 中央「螢苔林地」：發光苔蘚、月牙樹、發光石環。
// - 東北「根鬚迷宮」：樹根圍成的天然通道。
// - 東側「苔冠空地」：被一圈山脊圍住的平坦空地，中央是巨大的蘑菇樹（之後的頭目戰場）。
// - 「斷流小渠」由北往南流過林地，水被根系堵住而乾涸（之後的任務修復）。

/** 地圖原點（世界座標）：離晨曦谷地 2000 m，離酒館室內子場景（1000, 1000）也夠遠 */
export const GLOWMOSS_ORIGIN = { x: 2000, z: 0 } as const;
export const GLOWMOSS_SIZE = 320;
/** 判斷世界座標是否屬於這張地圖的範圍（地形之外再留一圈，遠景與邊界牆都算在內） */
export const GLOWMOSS_EXTENT = 420;

export function isInGlowmoss(x: number, z: number): boolean {
  return Math.abs(x - GLOWMOSS_ORIGIN.x) <= GLOWMOSS_EXTENT && Math.abs(z - GLOWMOSS_ORIGIN.z) <= GLOWMOSS_EXTENT;
}

type P2 = readonly [number, number];

/** 入口（從晨曦谷地過來的地方）：林緣小徑的西端，抵達時面向東方 */
export const GLOWMOSS_ARRIVAL = { x: -134, z: 4 } as const;
/** 月牙樹：林地西北的小丘上 */
export const CRESCENT_TREE = { x: -34, z: -24 } as const;
/** 發光石環 */
export const STONE_RING = { x: 16, z: 44, radius: 8 } as const;
/** 苔冠空地：中央蘑菇樹，外圍一圈山脊，只有西側有開口 */
export const MOSS_CROWN = { x: 100, z: 46, radius: 24 } as const;
/** 苔冠空地開口的方向（弧度，atan2(z, x)：π 為正西） */
const CROWN_GATE_ANGLE = Math.PI;
/** 根鬚迷宮的中心與半徑 */
export const ROOT_MAZE = { x: 76, z: -74, radius: 36 } as const;

/** 林間小徑（折線）：入口 → 林地中央 → 各區 */
export const GLOWMOSS_TRAILS: readonly (readonly P2[])[] = [
  // 入口 → 中央
  [
    [-150, 4],
    [-112, 0],
    [-84, 8],
    [-58, 2],
    [-30, -8],
    [0, -4],
  ],
  // 中央 → 根鬚迷宮入口
  [
    [0, -4],
    [22, -26],
    [40, -46],
    [52, -58],
  ],
  // 中央 → 發光石環 → 苔冠空地
  [
    [0, -4],
    [12, 18],
    [STONE_RING.x - 2, STONE_RING.z - 6],
  ],
  [
    [STONE_RING.x + 6, STONE_RING.z],
    [40, 46],
    [62, 44],
    [MOSS_CROWN.x - MOSS_CROWN.radius + 4, MOSS_CROWN.z],
  ],
  // 南側環線：石環 → 林地南邊 → 回到小徑
  [
    [STONE_RING.x - 4, STONE_RING.z + 6],
    [-10, 76],
    [-48, 82],
    [-78, 54],
    [-84, 8],
  ],
  // 往月牙樹的小岔路
  [
    [-30, -8],
    [CRESCENT_TREE.x + 2, CRESCENT_TREE.z + 8],
  ],
];
export const TRAIL_HALF_WIDTH = 1.6;

/** 斷流小渠：由北邊的泉眼往南，水被根系堵住而乾涸 */
export const CHANNEL_PATH: readonly P2[] = [
  [34, -150],
  [30, -108],
  [14, -66],
  [10, -32],
  [-6, 8],
  [-20, 46],
  [-12, 92],
  [6, 130],
  [10, 170],
];
export const CHANNEL_HALF_WIDTH = 2.4;
/** 渠底高度（乾涸的泥面；之後修復後的水面在 CHANNEL_WATER_LEVEL） */
const CHANNEL_BED = -1.1;
export const CHANNEL_WATER_LEVEL = -0.35;
/** 小徑跨過渠道的地方：渠底墊高成石頭鋪的淺灘，走過去不必跳 */
export const CHANNEL_CROSSINGS: readonly { x: number; z: number }[] = [
  { x: -4, z: 2 },
  { x: -17, z: 78 },
];
const CROSSING_BED = -0.3;

/** 小丘（大樹與地標底下的隆起） */
const MOUNDS: readonly { x: number; z: number; height: number; radius: number }[] = [
  { x: CRESCENT_TREE.x, z: CRESCENT_TREE.z, height: 2.6, radius: 9 },
  { x: -96, z: -52, height: 6, radius: 18 },
  { x: -110, z: 70, height: 5, radius: 16 },
  { x: -40, z: 120, height: 6, radius: 18 },
  { x: 50, z: 110, height: 7, radius: 18 },
  { x: 128, z: -20, height: 6, radius: 14 },
  { x: -60, z: -118, height: 8, radius: 20 },
  { x: 120, z: 126, height: 7, radius: 16 },
];

/** 平台：入口、石環、苔冠空地整平 */
const PADS: readonly { x: number; z: number; radius: number; falloff: number; height: number }[] = [
  { x: GLOWMOSS_ARRIVAL.x, z: GLOWMOSS_ARRIVAL.z, radius: 7, falloff: 8, height: 1.2 },
  { x: STONE_RING.x, z: STONE_RING.z, radius: STONE_RING.radius, falloff: 7, height: 1.4 },
  { x: MOSS_CROWN.x, z: MOSS_CROWN.z, radius: MOSS_CROWN.radius, falloff: 6, height: 1 },
];

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function segmentDistance(x: number, z: number, a: P2, b: P2): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - a[0]) * dx + (z - a[1]) * dz) / len2)) : 0;
  return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
}

function lineDistance(x: number, z: number, line: readonly P2[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) best = Math.min(best, segmentDistance(x, z, line[i]!, line[i + 1]!));
  return best;
}

/** 到最近小徑中心的距離（局部座標） */
export function glowmossPathDistance(x: number, z: number): number {
  let d = Infinity;
  for (const trail of GLOWMOSS_TRAILS) {
    d = Math.min(d, lineDistance(x, z, trail));
    if (d < 0.5) break;
  }
  return d;
}

/** 到渠道中心線的距離（局部座標） */
export function channelDistance(x: number, z: number): number {
  return lineDistance(x, z, CHANNEL_PATH);
}

/** 渠道中心線的總長（公尺，從泉眼起算） */
export const CHANNEL_LENGTH = CHANNEL_PATH.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - CHANNEL_PATH[i]![0], p[1] - CHANNEL_PATH[i]![1]), 0);

/** 某點投影到渠道中心線上、從泉眼起算的沿線距離（任務 8C：水流到哪裡為止） */
export function channelArc(x: number, z: number): number {
  let best = Infinity;
  let arc = 0;
  let run = 0;
  for (let i = 0; i + 1 < CHANNEL_PATH.length; i++) {
    const a = CHANNEL_PATH[i]!;
    const b = CHANNEL_PATH[i + 1]!;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    const t = Math.min(1, Math.max(0, ((x - a[0]) * dx + (z - a[1]) * dz) / (len * len)));
    const d = Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
    if (d < best) {
      best = d;
      arc = run + t * len;
    }
    run += len;
  }
  return arc;
}

/** 苔冠空地外圍山脊的高度（只有西側開口） */
function crownRidge(x: number, z: number): number {
  const dx = x - MOSS_CROWN.x;
  const dz = z - MOSS_CROWN.z;
  const d = Math.hypot(dx, dz);
  const ring = Math.exp(-(((d - (MOSS_CROWN.radius + 9)) / 6.5) ** 2));
  if (ring < 0.01) return 0;
  // 與開口方向的夾角：開口寬約 ±22°
  let a = Math.atan2(dz, dx) - CROWN_GATE_ANGLE;
  a = Math.atan2(Math.sin(a), Math.cos(a));
  const gate = smoothstep(0.2, 0.42, Math.abs(a));
  return ring * gate * 8;
}

/**
 * 森林地面的高度（局部座標）。
 * 起伏比草原明顯（林地的土丘與樹根隆起），小徑略為下凹，地圖最外緣抬升作為自然邊界。
 */
export function glowmossHeight(x: number, z: number): number {
  const rolling =
    Math.sin(x * 0.052 + 0.4) * Math.cos(z * 0.047 + 1.1) * 1.8 +
    Math.sin(x * 0.11 + 2.6) * Math.sin(z * 0.13 + 0.3) * 0.8 +
    Math.sin((x - z) * 0.027 + 0.9) * 1.4;
  let base = rolling + 1.2;
  if (base < 0) base = -base * 0.08;

  const pathDist = glowmossPathDistance(x, z);
  const pathDip = 1 - smoothstep(TRAIL_HALF_WIDTH * 0.6, TRAIL_HALF_WIDTH * 2.4, pathDist);
  // 小徑附近壓平一些，走起來不會忽高忽低
  const trailFlatten = 1 - 0.55 * (1 - smoothstep(TRAIL_HALF_WIDTH, TRAIL_HALF_WIDTH * 5, pathDist));
  let h = base * trailFlatten - pathDip * 0.22;

  for (const m of MOUNDS) {
    const d = Math.hypot(x - m.x, z - m.z) / m.radius;
    if (d < 3) h += m.height * Math.exp(-d * d);
  }

  const edge = Math.max(Math.abs(x), Math.abs(z)) / (GLOWMOSS_SIZE / 2);
  h += smoothstep(0.8, 1, edge) * 14;

  for (const pad of PADS) {
    const w = 1 - smoothstep(pad.radius, pad.radius + pad.falloff, Math.hypot(x - pad.x, z - pad.z));
    if (w > 0) h += (pad.height - pathDip * 0.2 - h) * w;
  }
  h += crownRidge(x, z);

  // 斷流小渠：下切到乾涸的渠底，兩岸緩坡；小徑跨越處墊高
  const cd = channelDistance(x, z);
  if (cd < CHANNEL_HALF_WIDTH + 6) {
    let bed = CHANNEL_BED;
    for (const c of CHANNEL_CROSSINGS) {
      const cw = 1 - smoothstep(2.5, 6, Math.hypot(x - c.x, z - c.z));
      bed += (CROSSING_BED - bed) * cw;
    }
    const w = 1 - smoothstep(CHANNEL_HALF_WIDTH - 1, CHANNEL_HALF_WIDTH + 4.5, cd);
    h += (bed - h) * w;
  }
  return h;
}
