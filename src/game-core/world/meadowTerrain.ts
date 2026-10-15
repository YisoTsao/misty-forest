// 風語草原（Bible §8，任務 9F）的地形高度。純函式、無外部 import（資料產生腳本以 Node 直接執行）。
//
// 座標為地圖的局部座標（地圖原點見 MEADOW_ORIGIN），慣例與其他地圖相同：-Z 為北、+X 為東，可玩區 ±148 m。
// Bible 建議 450 × 350，這裡沿用其他地圖的 320 m（探索紀錄與地形取樣共用同一個大小，決策 T-165）。
// - 西側入口：從澄鏡湖的古風帆過來，抵達時面向東方。
// - 區域 A「起伏草原」：大片緩丘與野花坡，彎月石拱。
// - 區域 B「風車聚落」：中央偏南的平地，三座風車、農舍與穀倉、農田。
// - 區域 C「浮石山脊」：北邊一道陡峭的長山脊（頂面約 13 m），只能靠上升氣流上去（之後的任務）。
// - 區域 D「風向塔台地」：東側抬高 5 m 的台地，舊風向塔與風帆平台，西側有一條緩坡。
// - 區域 E「風之巨偶競技場」：台地北端的圓形平地（之後的頭目戰場）。

/** 地圖原點（世界座標）：離澄鏡湖（4000, 0）2000 m */
export const MEADOW_ORIGIN = { x: 6000, z: 0 } as const;
export const MEADOW_SIZE = 320;
export const MEADOW_EXTENT = 420;

export function isInMeadow(x: number, z: number): boolean {
  return Math.abs(x - MEADOW_ORIGIN.x) <= MEADOW_EXTENT && Math.abs(z - MEADOW_ORIGIN.z) <= MEADOW_EXTENT;
}

type P2 = readonly [number, number];

/** 抵達點（從澄鏡湖的古風帆過來）：西側入口，面向東方 */
export const MEADOW_ARRIVAL = { x: -134, z: 10 } as const;
/** 風車聚落（區域 B）：平地中心與半徑；三座風車 */
export const HAMLET = { x: -28, z: 52, radius: 30 } as const;
export const WINDMILLS: readonly P2[] = [
  [-52, 38],
  [-18, 74],
  [6, 36],
];
/** 浮石山脊（區域 C）：沿 x 方向的長山脊（中心線、半寬、頂面高） */
export const RIDGE = { from: [-92, -86] as P2, to: [52, -84] as P2, halfWidth: 13, top: 13 } as const;
/** 風向塔台地（區域 D）與競技場（區域 E），台地高度 */
export const TOWER = { x: 96, z: 12, radius: 24 } as const;
export const ARENA = { x: 104, z: -52, radius: 20 } as const;
const PLATEAU_TOP = 5;
/** 台地西側的緩坡（從風車聚落那邊上來） */
const RAMP: readonly [P2, P2] = [
  [48, 30],
  [74, 20],
];
/** 彎月石拱（地標） */
export const CRESCENT_ARCH = { x: -84, z: -22 } as const;

/** 草原小徑：入口 → 聚落 → 緩坡 → 風向塔 → 競技場；聚落往北到山脊腳下的岔路 */
export const MEADOW_TRAILS: readonly (readonly P2[])[] = [
  [
    [-150, 10],
    [-104, 12],
    [-64, 30],
    [-40, 44],
    [-10, 46],
    [24, 38],
    [RAMP[0][0], RAMP[0][1]],
    [RAMP[1][0], RAMP[1][1]],
    [TOWER.x - 6, TOWER.z + 2],
    [TOWER.x + 2, TOWER.z - 18],
    [ARENA.x, ARENA.z + ARENA.radius - 2],
  ],
  [
    [-64, 30],
    [-80, -6],
    [-84, -40],
    [-70, -64],
  ],
];
export const MEADOW_TRAIL_HALF_WIDTH = 1.8;

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
export function meadowPathDistance(x: number, z: number): number {
  let d = Infinity;
  for (const trail of MEADOW_TRAILS) {
    d = Math.min(d, lineDistance(x, z, trail));
    if (d < 0.5) break;
  }
  return d;
}

/** 台地的權重（0 = 平原、1 = 台地頂面）：風向塔與競技場兩個圓合在一起，邊緣是陡坡，西側緩坡例外 */
export function plateauWeight(x: number, z: number): number {
  const tower = 1 - smoothstep(TOWER.radius, TOWER.radius + 4, Math.hypot(x - TOWER.x, z - TOWER.z));
  const arena = 1 - smoothstep(ARENA.radius + 2, ARENA.radius + 6, Math.hypot(x - ARENA.x, z - ARENA.z));
  // 兩圓之間的連接帶
  const neck = 1 - smoothstep(10, 14, segmentDistance(x, z, [TOWER.x, TOWER.z], [ARENA.x, ARENA.z]));
  // 東邊一路抬到地圖邊緣
  const east = smoothstep(108, 122, x) * (1 - smoothstep(60, 80, Math.abs(z + 20)));
  return Math.max(tower, arena, neck, east);
}

/** 山脊的權重（0 = 平原、1 = 山脊頂面），邊緣陡峭 */
export function ridgeWeight(x: number, z: number): number {
  const d = segmentDistance(x, z, RIDGE.from, RIDGE.to);
  return 1 - smoothstep(RIDGE.halfWidth - 2, RIDGE.halfWidth + 2.5, d);
}

/**
 * 草原的高度（局部座標）。
 * 起伏比晨曦谷地明顯但緩和（大片丘陵），小徑與聚落壓平；山脊與台地以陡坡抬高；地圖最外緣抬升作為自然邊界。
 */
export function meadowHeight(x: number, z: number): number {
  const rolling =
    Math.sin(x * 0.034 + 0.4) * Math.cos(z * 0.031 + 0.8) * 2.4 + Math.sin(x * 0.071 + 2.2) * Math.sin(z * 0.066 + 1.1) * 0.9 + Math.sin((x - z) * 0.019 + 0.5) * 1.6;
  let h = rolling + 2.6;
  if (h < 0.3) h = 0.3 + (h - 0.3) * 0.2;

  const pathDist = meadowPathDistance(x, z);
  const trailFlatten = 1 - 0.55 * (1 - smoothstep(MEADOW_TRAIL_HALF_WIDTH, MEADOW_TRAIL_HALF_WIDTH * 5, pathDist));
  h = h * trailFlatten - (1 - smoothstep(MEADOW_TRAIL_HALF_WIDTH * 0.6, MEADOW_TRAIL_HALF_WIDTH * 2.4, pathDist)) * 0.18;

  // 地圖最外緣抬升（入口的平地蓋過這一段）
  const edge = Math.max(Math.abs(x), Math.abs(z)) / (MEADOW_SIZE / 2);
  h += smoothstep(0.8, 1, edge) * 16;

  // 聚落、三座風車腳下與入口：平地
  for (const pad of [
    { x: HAMLET.x, z: HAMLET.z, radius: HAMLET.radius, height: 1.6 },
    ...WINDMILLS.map(([wx, wz]) => ({ x: wx, z: wz, radius: 6, height: 1.6 })),
    { x: MEADOW_ARRIVAL.x, z: MEADOW_ARRIVAL.z, radius: 7, height: 2.2 },
  ]) {
    const w = 1 - smoothstep(pad.radius, pad.radius + 8, Math.hypot(x - pad.x, z - pad.z));
    if (w > 0) h += (pad.height - h) * w;
  }

  // 台地：西側緩坡沿坡道逐漸抬高
  const pw = plateauWeight(x, z);
  if (pw > 0) h += (PLATEAU_TOP - h) * pw;
  const rampD = segmentDistance(x, z, RAMP[0], RAMP[1]);
  if (rampD < 8) {
    const [ax, az] = RAMP[0];
    const [bx, bz] = RAMP[1];
    const len2 = (bx - ax) ** 2 + (bz - az) ** 2;
    const t = Math.min(1, Math.max(0, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / len2));
    const rampH = h + (PLATEAU_TOP - h) * smoothstep(0, 1, t);
    const w = 1 - smoothstep(3, 8, rampD);
    h += (Math.max(h, rampH) - h) * w;
  }

  // 山脊：頂面平坦、邊緣陡峭（只能靠上升氣流上去）
  const rw = ridgeWeight(x, z);
  if (rw > 0) h += (RIDGE.top + Math.sin(x * 0.12) * 0.4 - h) * rw;

  return h;
}
