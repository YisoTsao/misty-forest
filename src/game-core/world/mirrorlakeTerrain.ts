// 澄鏡湖（Bible §7，任務 9A）的地形高度。純函式、無外部 import（資料產生腳本以 Node 直接執行）。
//
// 座標為地圖的局部座標（地圖原點見 MIRRORLAKE_ORIGIN），慣例與其他地圖相同：-Z 為北、+X 為東，可玩區 ±148 m。
// - 北側「林間水道」：從螢苔祕林順著水道走下來的入口。
// - 西岸「湖畔營地」（區域 A）：漁屋、木碼頭、營火。
// - 湖中央偏東「水鏡神殿」（區域 E）：湖中的小島，之後的頭目戰場。
// - 「淺水石徑」（區域 B）：從營地一路涉水通往神殿島的石頭淺灘（水深約 25 cm，不會落水）。
// - 北邊「倒影蘆葦島」（區域 C）：北岸以「月弧木橋」相連。
// - 南岸「半沉沒的水鏡遺構」（區域 D）：一半泡在水裡的石柱與台基；湖裡還有一座半沉沒的鐘樓。
// 湖面高度與晨曦谷地相同（WATER_LEVEL = -1），水深超過 60 cm 就算落水（回到安全點，不做游泳）。

/** 地圖原點（世界座標）：離螢苔祕林（2000, 0）2000 m */
export const MIRRORLAKE_ORIGIN = { x: 4000, z: 0 } as const;
export const MIRRORLAKE_SIZE = 320;
/** 判斷世界座標是否屬於這張地圖（地形之外再留一圈：遠景與邊界牆） */
export const MIRRORLAKE_EXTENT = 420;

export function isInMirrorlake(x: number, z: number): boolean {
  return Math.abs(x - MIRRORLAKE_ORIGIN.x) <= MIRRORLAKE_EXTENT && Math.abs(z - MIRRORLAKE_ORIGIN.z) <= MIRRORLAKE_EXTENT;
}

type P2 = readonly [number, number];

const LAKE_WATER = -1;
/** 抵達點：林間水道的南端，面向南方的湖 */
export const MIRRORLAKE_ARRIVAL = { x: -64, z: -132 } as const;
/** 湖：橢圓，中心、東西半徑、南北半徑；湖底深度 */
export const MIRROR_LAKE = { x: 6, z: 14, rx: 92, rz: 68 } as const;
const LAKE_BED = -4.5;
/** 湖畔營地（西岸） */
export const LAKE_CAMP = { x: -112, z: 8, radius: 15 } as const;
/** 水鏡神殿：湖中的小島（之後的頭目戰場） */
export const MIRROR_TEMPLE = { x: 46, z: 18, radius: 17 } as const;
/** 倒影蘆葦島（北邊），以月弧木橋接到北岸 */
export const REED_ISLE = { x: -2, z: -18, radius: 9 } as const;
export const MOON_BRIDGE: readonly [P2, P2] = [
  [-2, -48],
  [-2, -28],
];
/** 半沉沒的水鏡遺構（南岸，一半在水裡） */
export const MIRROR_RUINS = { x: 18, z: 78, radius: 14 } as const;
/** 湖裡半沉沒的鐘樓 */
export const SUNKEN_BELL = { x: -36, z: 44 } as const;
/** 三面水鏡（之後的光路謎題）：北岸、東岸、遺構 */
export const MIRROR_PILLARS: readonly P2[] = [
  [-46, -44],
  [104, -6],
  [18, 70],
];

/** 淺水石徑：從營地的碼頭附近涉水到神殿島 */
export const SHALLOW_PATH: readonly P2[] = [
  [-98, 14],
  [-70, 8],
  [-42, 16],
  [-14, 10],
  [12, 18],
  [32, 16],
];
export const SHALLOW_HALF_WIDTH = 2.6;
/** 淺灘的水底：水深 25 cm（腳踩得到、看得到水，不會落水） */
const SHALLOW_BED = LAKE_WATER - 0.25;

/** 岸上的小徑（入口 → 營地、北岸 → 月弧木橋、東岸、南岸遺構） */
export const MIRRORLAKE_TRAILS: readonly (readonly P2[])[] = [
  [
    [-64, -150],
    [-66, -120],
    [-80, -94],
    [-104, -70],
    [-122, -36],
    [-120, -6],
    [LAKE_CAMP.x, LAKE_CAMP.z],
  ],
  [
    [-80, -94],
    [-44, -84],
    [-14, -76],
    [-2, -62],
    [-2, -50],
  ],
  [
    [-14, -76],
    [30, -84],
    [72, -70],
    [104, -40],
    [112, -2],
    [104, 40],
    [72, 82],
    [MIRROR_RUINS.x + 10, MIRROR_RUINS.z + 10],
  ],
];
export const MIRRORLAKE_TRAIL_HALF_WIDTH = 1.7;

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
export function mirrorlakePathDistance(x: number, z: number): number {
  let d = Infinity;
  for (const trail of MIRRORLAKE_TRAILS) {
    d = Math.min(d, lineDistance(x, z, trail));
    if (d < 0.5) break;
  }
  return d;
}

/** 到淺水石徑中心的距離 */
export function shallowPathDistance(x: number, z: number): number {
  return lineDistance(x, z, SHALLOW_PATH);
}

/** 在湖的橢圓裡的程度：< 1 在湖內 */
function lakeRadius(x: number, z: number): number {
  return Math.hypot((x - MIRROR_LAKE.x) / MIRROR_LAKE.rx, (z - MIRROR_LAKE.z) / MIRROR_LAKE.rz);
}

/** 小島（神殿、蘆葦島、遺構台基）的頂面高度與範圍 */
const ISLANDS: readonly { x: number; z: number; radius: number; top: number; falloff: number }[] = [
  { x: MIRROR_TEMPLE.x, z: MIRROR_TEMPLE.z, radius: MIRROR_TEMPLE.radius, top: 0.6, falloff: 7 },
  { x: REED_ISLE.x, z: REED_ISLE.z, radius: REED_ISLE.radius, top: -0.2, falloff: 6 },
];

/** 岸上的整平區：營地、遺構岸邊 */
const PADS: readonly { x: number; z: number; radius: number; falloff: number; height: number }[] = [
  { x: LAKE_CAMP.x, z: LAKE_CAMP.z, radius: LAKE_CAMP.radius, falloff: 8, height: 0.4 },
  { x: MIRRORLAKE_ARRIVAL.x, z: MIRRORLAKE_ARRIVAL.z, radius: 7, falloff: 8, height: 1.4 },
];

/**
 * 湖岸地形的高度（局部座標）。
 * 岸上是平緩的草坡與沙灘，湖心最深約 3.5 m；淺水石徑、小島與遺構台基各自蓋過湖底；地圖最外緣抬升成自然邊界。
 */
export function mirrorlakeHeight(x: number, z: number): number {
  const rolling =
    Math.sin(x * 0.045 + 0.7) * Math.cos(z * 0.05 + 0.2) * 1.5 + Math.sin(x * 0.12 + 1.9) * Math.sin(z * 0.1 + 0.6) * 0.6 + Math.sin((x + z) * 0.025 + 1.3) * 1.2;
  let h = rolling + 1.6;
  if (h < 0.3) h = 0.3 + (h - 0.3) * 0.15;

  const pathDist = mirrorlakePathDistance(x, z);
  const trailFlatten = 1 - 0.5 * (1 - smoothstep(MIRRORLAKE_TRAIL_HALF_WIDTH, MIRRORLAKE_TRAIL_HALF_WIDTH * 5, pathDist));
  h = h * trailFlatten - (1 - smoothstep(MIRRORLAKE_TRAIL_HALF_WIDTH * 0.6, MIRRORLAKE_TRAIL_HALF_WIDTH * 2.4, pathDist)) * 0.15;

  const edge = Math.max(Math.abs(x), Math.abs(z)) / (MIRRORLAKE_SIZE / 2);
  h += smoothstep(0.8, 1, edge) * 16;

  for (const pad of PADS) {
    const w = 1 - smoothstep(pad.radius, pad.radius + pad.falloff, Math.hypot(x - pad.x, z - pad.z));
    if (w > 0) h += (pad.height - h) * w;
  }

  // 湖：岸邊是緩坡的沙灘，往湖心變深
  const r = lakeRadius(x, z);
  if (r < 1.25) {
    const shore = 1 - smoothstep(0.82, 1.08, r);
    // 岸邊（r ≈ 0.98）比水面高 0.4 m，往湖心（r ≤ 0.55）降到湖底
    const deep = 1 - smoothstep(0.55, 0.98, r);
    const depth = LAKE_WATER + 0.4 + (LAKE_BED - LAKE_WATER - 0.4) * deep;
    h += (depth - h) * shore;
  }
  // 淺水石徑：涉水的石頭淺灘
  const sd = shallowPathDistance(x, z);
  if (sd < SHALLOW_HALF_WIDTH + 5) {
    const w = 1 - smoothstep(SHALLOW_HALF_WIDTH - 0.5, SHALLOW_HALF_WIDTH + 3, sd);
    if (h < SHALLOW_BED) h += (SHALLOW_BED - h) * w;
  }
  for (const isle of ISLANDS) {
    const w = 1 - smoothstep(isle.radius, isle.radius + isle.falloff, Math.hypot(x - isle.x, z - isle.z));
    if (w > 0) h += (isle.top - h) * w;
  }
  // 遺構：岸邊半沉在水裡的台基（一半高於水面、一半在淺水）
  const rd = Math.hypot(x - MIRROR_RUINS.x, z - MIRROR_RUINS.z);
  if (rd < MIRROR_RUINS.radius + 6) {
    const w = 1 - smoothstep(MIRROR_RUINS.radius - 2, MIRROR_RUINS.radius + 6, rd);
    const top = SHALLOW_BED + (0.2 - SHALLOW_BED) * smoothstep(MIRROR_RUINS.z - 1, MIRROR_RUINS.z + 5, z);
    h += (top - h) * w;
  }
  return h;
}

/** 湖面（任務 9A 的水面網格用）：這張地圖的水都在湖裡 */
export function isMirrorlakeWater(x: number, z: number): boolean {
  return mirrorlakeHeight(x, z) < LAKE_WATER + 0.3;
}
