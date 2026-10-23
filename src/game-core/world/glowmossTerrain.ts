// 螢苔祕林（第二章，Bible §6.3；任務 12B）的地形高度。純函式、無 import（資料產生腳本以 Node 直接執行）。
//
// 座標為地圖的局部座標（地圖原點見 GLOWMOSS_ORIGIN），慣例與晨曦谷地相同：-Z 為北、+X 為東。
// 地圖與晨曦谷地放在同一個物理世界的遠處（決策 T-117），可玩區同為 ±148 m。七個區域（Bible §6.3 的 A–G）：
// - A 迷霧入口（西端）：從晨曦谷地過來的林道入口、橫跨小徑的石拱門。
// - B 螢苔花園（入口往東）：淺淺的盆地，四周一圈巨型蘑菇。
// - C 倒流溪谷（花園往北）：南北向的谷地，北端是瀑布（星晶祕窟的入口之後藏在瀑布後面）。
// - D 蘑菇居民聚落（中央）：台地，四周的山脊只在北面開口，從溪谷那一側進去。
// - E 迷霧深層（東南）：低窪、扭曲樹木的林地。
// - F 星晶祕窟（北邊）：被山脊完全圍住的窪地（之後從瀑布後的洞穴進去）。
// - G 古樹祭壇（東邊）：高台與巨型空心古樹，旁邊是往澄鏡湖的出口。
// 區域之間的封鎖（水輪、濃霧、樹根）在之後的任務加入；12B 只有地形與小徑。

/** 地圖原點（世界座標）：離晨曦谷地 2000 m，離酒館室內子場景（1000, 1000）也夠遠 */
export const GLOWMOSS_ORIGIN = { x: 2000, z: 0 } as const;
export const GLOWMOSS_SIZE = 320;
/** 判斷世界座標是否屬於這張地圖的範圍（地形之外再留一圈，遠景與邊界牆都算在內） */
export const GLOWMOSS_EXTENT = 420;

export function isInGlowmoss(x: number, z: number): boolean {
  return Math.abs(x - GLOWMOSS_ORIGIN.x) <= GLOWMOSS_EXTENT && Math.abs(z - GLOWMOSS_ORIGIN.z) <= GLOWMOSS_EXTENT;
}

type P2 = readonly [number, number];

/** 入口（從晨曦谷地過來的地方）：迷霧入口的西端，抵達時面向東方 */
export const GLOWMOSS_ARRIVAL = { x: -134, z: 4 } as const;
/** A 迷霧入口的石拱門（橫跨小徑） */
export const MIST_ARCH = { x: -110, z: 2 } as const;
/** B 螢苔花園的盆地 */
export const GLOW_GARDEN = { x: -56, z: 6, radius: 26 } as const;
/** C 倒流溪谷的谷底（由南往北）與北端的瀑布 */
export const CREEK_PATH: readonly P2[] = [
  [-38, -46],
  [-26, -78],
  [-20, -110],
  [-26, -136],
];
export const CREEK_FALLS = { x: -26, z: -138 } as const;
/** D 蘑菇居民聚落的台地；山脊只在北面開口 */
export const MUSHROOM_VILLAGE = { x: 36, z: 6, radius: 22 } as const;
/** E 迷霧深層的低地 */
export const DEEP_MIST = { x: 52, z: 92, radius: 30 } as const;
/** F 星晶祕窟的窪地（山脊沒有開口） */
export const CRYSTAL_GROTTO = { x: 20, z: -124, radius: 14 } as const;
/** G 古樹祭壇的高台與古樹 */
export const ANCIENT_ALTAR = { x: 112, z: 0, radius: 20 } as const;
/** 往澄鏡湖的出口（祭壇東南，Bible §6.12：quest_forest_008 之後才開；過渡期間見 T-187） */
export const LAKE_EXIT = { x: 132, z: 52 } as const;

/** 林間小徑（折線）：入口 → 花園 → 溪谷 → 聚落 → 深層 → 祭壇 → 澄鏡湖出口 */
export const GLOWMOSS_TRAILS: readonly (readonly P2[])[] = [
  // A → B：入口穿過石拱門進花園
  [
    [-150, 4],
    [GLOWMOSS_ARRIVAL.x, GLOWMOSS_ARRIVAL.z],
    [MIST_ARCH.x, MIST_ARCH.z],
    [-90, 4],
    [-72, 6],
    [GLOW_GARDEN.x, GLOW_GARDEN.z],
  ],
  // B 花園裡的環狀步道（半徑 16 m 的圓，從西邊的入口接進來）
  Array.from({ length: 13 }, (_, i): P2 => {
    const a = Math.PI + (i / 12) * Math.PI * 2;
    return [Math.round((GLOW_GARDEN.x + Math.cos(a) * 16) * 10) / 10, Math.round((GLOW_GARDEN.z + Math.sin(a) * 16) * 10) / 10];
  }),
  // B → C：從環狀步道的北側往北進溪谷，一路到瀑布
  [
    [GLOW_GARDEN.x, GLOW_GARDEN.z - 16],
    [-38, -46],
    [-28, -78],
    [-22, -110],
    [-24, -130],
  ],
  // C → D：溪谷中段往東，從北面開口進聚落
  [
    [-28, -78],
    [-2, -58],
    [22, -38],
    [MUSHROOM_VILLAGE.x, -20],
    [MUSHROOM_VILLAGE.x, MUSHROOM_VILLAGE.z],
  ],
  // D → E：聚落往南（南面山脊之後在任務裡開路；12B 先留一條坡道）
  [
    [MUSHROOM_VILLAGE.x, MUSHROOM_VILLAGE.z],
    [40, 38],
    [48, 68],
    [DEEP_MIST.x, DEEP_MIST.z],
  ],
  // E → G：深層往東北上祭壇
  [
    [DEEP_MIST.x, DEEP_MIST.z],
    [80, 72],
    [98, 42],
    [106, 18],
    [ANCIENT_ALTAR.x, ANCIENT_ALTAR.z],
  ],
  // G → 澄鏡湖出口
  [
    [106, 18],
    [120, 34],
    [LAKE_EXIT.x - 4, LAKE_EXIT.z - 2],
  ],
];
export const TRAIL_HALF_WIDTH = 1.6;

/** 這個高度以下才畫成水邊泥地；12B 的溪谷還沒有水（谷底 −0.5），沒有地方會低於這個高度 */
export const GLOWMOSS_WATER_LEVEL = -2.4;

/** 小丘（大樹與地標底下的隆起） */
const MOUNDS: readonly { x: number; z: number; height: number; radius: number }[] = [
  { x: -96, z: -52, height: 6, radius: 18 },
  { x: -110, z: 64, height: 5, radius: 16 },
  { x: -80, z: 110, height: 6, radius: 18 },
  { x: -10, z: 90, height: 5, radius: 16 },
  { x: -70, z: -110, height: 8, radius: 20 },
  { x: 128, z: -70, height: 7, radius: 16 },
  { x: 120, z: 120, height: 6, radius: 14 },
  { x: 70, z: -60, height: 5, radius: 14 },
];

/** 平台：入口、石拱門、花園盆地、聚落台地、深層低地、祕窟窪地、祭壇高台 */
const PADS: readonly { x: number; z: number; radius: number; falloff: number; height: number }[] = [
  { x: GLOWMOSS_ARRIVAL.x, z: GLOWMOSS_ARRIVAL.z, radius: 7, falloff: 8, height: 1.2 },
  { x: MIST_ARCH.x, z: MIST_ARCH.z, radius: 5, falloff: 6, height: 1.3 },
  { x: GLOW_GARDEN.x, z: GLOW_GARDEN.z, radius: GLOW_GARDEN.radius, falloff: 10, height: 0.5 },
  { x: MUSHROOM_VILLAGE.x, z: MUSHROOM_VILLAGE.z, radius: MUSHROOM_VILLAGE.radius, falloff: 8, height: 2.4 },
  { x: DEEP_MIST.x, z: DEEP_MIST.z, radius: DEEP_MIST.radius, falloff: 12, height: -0.3 },
  { x: CRYSTAL_GROTTO.x, z: CRYSTAL_GROTTO.z, radius: CRYSTAL_GROTTO.radius, falloff: 6, height: 0.4 },
  { x: ANCIENT_ALTAR.x, z: ANCIENT_ALTAR.z, radius: ANCIENT_ALTAR.radius, falloff: 8, height: 3.2 },
];

/** 環狀山脊：圍住聚落、祭壇與祕窟；gates 是開口的方向（弧度，atan2(z, x)） */
const RINGS: readonly { x: number; z: number; radius: number; width: number; height: number; gates: readonly number[] }[] = [
  // 聚落：北面開口（從溪谷過來）、南面留一道之後開路的缺口
  { x: MUSHROOM_VILLAGE.x, z: MUSHROOM_VILLAGE.z, radius: MUSHROOM_VILLAGE.radius + 7, width: 5, height: 6, gates: [-Math.PI / 2, Math.PI / 2] },
  // 祭壇：西南面向深層的小徑開口
  { x: ANCIENT_ALTAR.x, z: ANCIENT_ALTAR.z, radius: ANCIENT_ALTAR.radius + 7, width: 5.5, height: 7, gates: [Math.atan2(18, -6)] },
  // 祕窟：東南面的隱藏入口，平時被星光石門擋住（P-03：光照到石門才打開，見 crystal_gate）
  { x: CRYSTAL_GROTTO.x, z: CRYSTAL_GROTTO.z, radius: CRYSTAL_GROTTO.radius + 6, width: 5, height: 9, gates: [Math.atan2(-12, 26)] },
];
/** 開口的半寬（弧度） */
const GATE_HALF = 0.36;

/**
 * 溪谷：谷底高度與兩側緩坡的寬度。谷底高於共用水位 WATER_LEVEL（−1）+ 0.3：低於那裡會被當成水邊（不長草、不記錄安全點、不生成怪物）；
 * 溪水在 Phase 2（倒流溪谷）加入時再決定水面
 */
const CREEK_BED = -0.5;
const CREEK_HALF_WIDTH = 7;

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

/** 到溪谷中心線的距離（局部座標） */
export function creekDistance(x: number, z: number): number {
  return lineDistance(x, z, CREEK_PATH);
}

/** 環狀山脊在這一點的高度（開口處為 0） */
function ringHeight(x: number, z: number): number {
  let h = 0;
  for (const ring of RINGS) {
    const dx = x - ring.x;
    const dz = z - ring.z;
    const d = Math.hypot(dx, dz);
    const band = Math.exp(-(((d - ring.radius) / ring.width) ** 2));
    if (band < 0.01) continue;
    let open = 1;
    for (const g of ring.gates) {
      let a = Math.atan2(dz, dx) - g;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      open = Math.min(open, smoothstep(GATE_HALF * 0.55, GATE_HALF, Math.abs(a)));
    }
    h += band * open * ring.height;
  }
  return h;
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

  // 溪谷：下切到谷底，兩側緩坡（小徑在谷底，跟著一起降下去）
  const cd = creekDistance(x, z);
  if (cd < CREEK_HALF_WIDTH + 8) {
    const w = 1 - smoothstep(CREEK_HALF_WIDTH * 0.5, CREEK_HALF_WIDTH + 8, cd);
    h += (CREEK_BED - pathDip * 0.2 - h) * w;
  }

  for (const pad of PADS) {
    const w = 1 - smoothstep(pad.radius, pad.radius + pad.falloff, Math.hypot(x - pad.x, z - pad.z));
    if (w > 0) h += (pad.height - pathDip * 0.2 - h) * w;
  }
  // 山脊不蓋過小徑：小徑經過的地方就是開口
  h += ringHeight(x, z) * smoothstep(TRAIL_HALF_WIDTH * 1.5, TRAIL_HALF_WIDTH * 4, pathDist);
  return h;
}
