// 以固定種子產生出生草原的樹木、岩石、寶箱、小村莊與可採集植物 placement，寫入 src/data/placements.json。
// 執行：node scripts/gen-placements.ts（Node 24 原生支援 TS 型別剝除）
import { readFileSync, writeFileSync } from 'node:fs';
import {
  BRIDGE,
  distanceToPath,
  ISLAND,
  isUnderwater,
  LAKE,
  PATH_HALF_WIDTH,
  SPAWN_POINT,
  TERRAIN_SIZE,
  terrainHeight,
  VILLAGE_CENTER,
  VILLAGE_RADIUS,
} from '../src/game-core/world/terrain.ts';
import { mulberry32 } from '../src/game-core/util/random.ts';

const rand = mulberry32(20261012);
const half = TERRAIN_SIZE / 2 - 6;
const placements: object[] = [];
const taken: { x: number; z: number; r: number }[] = [];
const round = (n: number) => Math.round(n * 100) / 100;

/** 第一個可互動物件：出生點左前方的寶箱（小路在出生點東側）（任務 1C） */
const CHEST = { x: -3.5, z: 11.5, yaw: 0.45 };
taken.push({ x: CHEST.x, z: CHEST.z, r: 3 });
placements.push({
  id: 'meadow_chest_001',
  prefabId: 'chest_wood',
  regionId: 'meadow',
  position: [CHEST.x, round(terrainHeight(CHEST.x, CHEST.z) - 0.02), CHEST.z],
  rotation: [0, CHEST.yaw, 0],
  scale: [0.55, 0.55, 0.55],
});

/**
 * 小村莊（規格 4.3 生活感細節）：房屋、井、風車、柵欄圍成的小牧場與木桶、木箱等雜物。
 * 座標以村莊中心為原點手動配置；face 為建築正面（模型 +Z）朝向的世界座標。
 */
type VillageItem = { prefab: string; at: [number, number]; scale: number; face?: [number, number]; yaw?: number; y?: number };
const V = VILLAGE_CENTER;
const village: VillageItem[] = [
  { prefab: 'house_small_blue', at: [-7.5, 8], scale: 5.5, face: [0, 8] },
  { prefab: 'house_tall_red', at: [-8, -2.5], scale: 5.2, face: [0, -2.5] },
  { prefab: 'tavern', at: [8.5, 4], scale: 5.2, face: [0, 4] },
  { prefab: 'house_small_yellow', at: [8, -6.5], scale: 5.5, face: [0, -6.5] },
  { prefab: 'well', at: [-3.6, 3], scale: 4.2, yaw: 0.3 },
  { prefab: 'windmill', at: [-13, -11], scale: 6.5, face: [0, -6] },
  // 雜物
  { prefab: 'barrel', at: [6.2, 8.4], scale: 4.4 },
  { prefab: 'barrel', at: [7.3, 9.1], scale: 4.2, yaw: 1 },
  { prefab: 'crate_big', at: [5.8, -3.2], scale: 4.5, yaw: 0.4 },
  { prefab: 'crate_small', at: [5.8, -3.2], scale: 4.5, yaw: 0.9, y: 0.94 },
  { prefab: 'crate_small', at: [6.6, -2.2], scale: 4.5, yaw: 0.2 },
  { prefab: 'wheelbarrow', at: [-4.2, 11.5], scale: 4.2, yaw: 2.4 },
  { prefab: 'lumber_pile', at: [-9.5, -14.5], scale: 4.2, yaw: 0.5 },
  { prefab: 'sack', at: [-2.6, 1.6], scale: 4, yaw: 0.7 },
  { prefab: 'bucket_water', at: [-2.4, 4.6], scale: 4 },
  { prefab: 'barrel', at: [-11.8, -5.6], scale: 4.4, yaw: 2 },
];

/** 柵欄圍成的小牧場（之後放羊）：模型的柵欄在六角地塊邊緣（局部 x = -1），以 yaw 轉到四邊 */
const PEN = { at: [-17, 2] as [number, number], segments: 3, scale: 2.2 };
const segmentLength = 1.15 * PEN.scale;
const penHalf = (PEN.segments * segmentLength) / 2;
for (let side = 0; side < 4; side++) {
  // 四邊的外法線方向：-X、+Z、+X、-Z；柵欄局部 -X 對應該法線
  const yaw = (side * Math.PI) / 2;
  const nx = -Math.cos(yaw);
  const nz = Math.sin(yaw);
  // 沿邊方向（局部 Z 經旋轉）
  const tx = Math.sin(yaw);
  const tz = Math.cos(yaw);
  for (let i = 0; i < PEN.segments; i++) {
    if (side === 2 && i === 1) continue; // 東側留出入口
    const along = -penHalf + segmentLength * (i + 0.5);
    // 柵欄中心 = 牧場中心 + 法線 × 半邊長 + 切線 × along；模型原點再往內退 1 個模型單位
    const cx = PEN.at[0] + nx * penHalf + tx * along - nx * PEN.scale;
    const cz = PEN.at[1] + nz * penHalf + tz * along - nz * PEN.scale;
    village.push({ prefab: 'fence_wood', at: [cx, cz], scale: PEN.scale, yaw });
  }
}

village.forEach((item, i) => {
  const x = V.x + item.at[0];
  const z = V.z + item.at[1];
  const yaw = item.face ? Math.atan2(V.x + item.face[0] - x, V.z + item.face[1] - z) : (item.yaw ?? 0);
  placements.push({
    id: `village_${item.prefab}_${String(i + 1).padStart(2, '0')}`,
    prefabId: item.prefab,
    regionId: 'village',
    position: [round(x), round(terrainHeight(x, z) - 0.03 + (item.y ?? 0)), round(z)],
    rotation: [0, round(yaw), 0],
    scale: [item.scale, item.scale, item.scale],
  });
});
// 村莊範圍內不散佈樹木與岩石
taken.push({ x: V.x, z: V.z, r: VILLAGE_RADIUS + 2 });

// 攝影機書籤位置附近不放物件，避免截圖鏡頭卡在樹裡
// 只考慮 Phase 1 的書籤：之後新增的書籤（鏡湖等）不影響散佈，重新產生時其他物件的位置與 id 不變
const PHASE1_BOOKMARKS = new Set(['meadow', 'village', 'forest', 'overlook', 'character']);
const bookmarks = (JSON.parse(readFileSync('src/data/cameraBookmarks.json', 'utf8')) as { id: string; position: number[]; target: number[] }[]).filter((b) =>
  PHASE1_BOOKMARKS.has(b.id),
);
for (const b of bookmarks) {
  taken.push({ x: b.position[0]!, z: b.position[2]!, r: 5 });
  // 鏡頭前方 12 m 內也保持淨空，避免前景被大型物件擋住
  const dx = b.target[0]! - b.position[0]!;
  const dz = b.target[2]! - b.position[2]!;
  const len = Math.hypot(dx, dz);
  for (const d of [4, 8, 12]) taken.push({ x: b.position[0]! + (dx / len) * d, z: b.position[2]! + (dz / len) * d, r: 3 });
}

function free(x: number, z: number, r: number): boolean {
  if (Math.hypot(x - SPAWN_POINT.x, z - SPAWN_POINT.z) < 12) return false; // 出生點保持開闊
  if (distanceToPath(x, z) < PATH_HALF_WIDTH + 2) return false; // 不擋路
  return !taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + r);
}

function scatter(opts: {
  count: number;
  prefix: string;
  prefabs: readonly string[];
  spacing: number;
  scale: [number, number];
  /** 回傳 0–1：該位置放置的機率 */
  density: (edge: number) => number;
  /** 只在此圓形範圍內散佈（省略時為整張地圖） */
  area?: { x: number; z: number; r: number };
  regionId?: string;
}): void {
  let placed = 0;
  let attempts = 0;
  while (placed < opts.count && attempts < 40000) {
    attempts++;
    let x = (rand() * 2 - 1) * half;
    let z = (rand() * 2 - 1) * half;
    if (opts.area) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * opts.area.r;
      x = opts.area.x + Math.cos(a) * r;
      z = opts.area.z + Math.sin(a) * r;
      if (Math.abs(x) > half || Math.abs(z) > half) continue;
    }
    const edge = Math.max(Math.abs(x), Math.abs(z)) / half;
    if (rand() > opts.density(edge)) continue;
    if (!free(x, z, opts.spacing)) continue;
    taken.push({ x, z, r: opts.spacing });
    placed++;
    const s = opts.scale[0] + rand() * (opts.scale[1] - opts.scale[0]);
    placements.push({
      id: `${opts.prefix}_${String(placed).padStart(3, '0')}`,
      prefabId: opts.prefabs[Math.floor(rand() * opts.prefabs.length)],
      regionId: opts.regionId ?? 'meadow',
      position: [round(x), round(terrainHeight(x, z) - 0.05), round(z)],
      rotation: [0, round(rand() * Math.PI * 2), 0],
      scale: [round(s), round(s * (0.9 + rand() * 0.25)), round(s)],
    });
  }
}

// 東北角的森林：較密的樹林（森林書籤的取景範圍）
scatter({
  count: 70,
  prefix: 'forest_tree',
  prefabs: ['tree_round', 'tree_tall', 'tree_tall'],
  spacing: 2.1,
  scale: [5, 7.5],
  density: () => 1,
  area: { x: 60, z: -58, r: 22 },
  regionId: 'forest',
});

// 中央草原較稀疏，越往外越密（森林感）
scatter({
  count: 150,
  prefix: 'meadow_tree',
  prefabs: ['tree_round', 'tree_tall'],
  spacing: 1.6,
  scale: [4.5, 6.8],
  density: (edge) => 0.15 + edge * edge * 0.85,
});
scatter({
  count: 34,
  prefix: 'meadow_rock',
  // 扁平岩石只當點綴，比例較低
  prefabs: ['rock_flat', 'rock_round', 'rock_round', 'rock_tall', 'rock_tall'],
  spacing: 1.6,
  scale: [8, 13],
  density: () => 0.5,
});

// 可採集的花叢與草藥（任務 2A）。放在最後產生，前面的樹木與岩石位置不受影響。
// 出生點外圍一圈先放幾叢，教學時一出發就看得到。
scatter({
  count: 8,
  prefix: 'meadow_flower',
  prefabs: ['flower_patch'],
  spacing: 1.2,
  scale: [1.9, 2.3],
  density: () => 1,
  area: { x: SPAWN_POINT.x, z: SPAWN_POINT.z, r: 24 },
});
scatter({
  count: 22,
  prefix: 'meadow_flower_wild',
  prefabs: ['flower_patch'],
  spacing: 1.2,
  scale: [1.9, 2.3],
  density: (edge) => 1 - edge * 0.6,
});
scatter({
  count: 10,
  prefix: 'forest_herb',
  prefabs: ['herb_bush'],
  spacing: 1.2,
  scale: [1.8, 2.2],
  density: () => 1,
  area: { x: 60, z: -58, r: 24 },
  regionId: 'forest',
});
scatter({
  count: 8,
  prefix: 'meadow_herb',
  prefabs: ['herb_bush'],
  spacing: 1.2,
  scale: [1.8, 2.2],
  density: (edge) => edge,
});

// 湖泊與木橋（任務 3D）：湖裡、湖岸、小島（Phase 4 家園預定地）與橋頭的物件全部移除。
// 以事後過濾處理，其他物件的位置與 id 都不變。
const kept = placements.filter((p) => {
  const [x, , z] = (p as { position: number[] }).position as [number, number, number];
  if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.radius + 3 && isUnderwater(x, z, 0.6)) return false;
  if (Math.hypot(x - ISLAND.x, z - ISLAND.z) < ISLAND.radius + 2) return false;
  const bridgeWest = BRIDGE.x - BRIDGE.length / 2;
  if (x > bridgeWest - 5 && x < BRIDGE.x && Math.abs(z - BRIDGE.z) < 4) return false;
  return true;
});
console.log(`removed ${placements.length - kept.length} placements in the lake area`);
placements.length = 0;
placements.push(...kept);
placements.push({
  id: 'lake_bridge',
  prefabId: 'wood_bridge',
  regionId: 'lake',
  position: [BRIDGE.x, BRIDGE.deckY, BRIDGE.z],
  // 橋沿局部 +Z，轉 90° 後沿世界 +X 從西岸接到小島
  rotation: [0, round(Math.PI / 2), 0],
});

// 可進入建築的室內（任務 5B）：子場景放在遠離開放世界的座標（data/interiors.json 的 origin），
// 不與開放世界混用（規格 5.1）。房間外殼、家具與出口都是一般的 placement。
const INTERIOR = { x: 1000, z: 1000 };
const interior: [string, string, number, number, number, number, number?][] = [
  // id, prefab, 局部 x, 局部 z, yaw, scale, y
  ['tavern_room', 'tavern_room', 0, 0, 0, 1],
  ['tavern_exit', 'interior_exit', 0, 3.9, 0, 1],
  ['tavern_rug', 'rug', 0, 0.8, 0, 1.1, 0.01],
  ['tavern_bar', 'bar_counter', -3.2, -2.4, 0, 0.85],
  ['tavern_cabinet', 'cabinet', -3.2, -4.0, 0, 0.8],
  ['tavern_table_1', 'build_table', 2.8, -1.8, 0, 0.7],
  ['tavern_chair_1a', 'build_chair', 2.8, -0.9, Math.PI, 0.7],
  ['tavern_chair_1b', 'build_chair', 2.8, -2.7, 0, 0.7],
  ['tavern_table_2', 'build_table', 3.4, 2.2, 0.3, 0.7],
  ['tavern_chair_2a', 'build_chair', 2.4, 2.4, Math.PI / 2, 0.7],
  ['tavern_chair_2b', 'build_chair', 4.4, 2.0, -Math.PI / 2, 0.7],
  ['tavern_barrel_1', 'barrel', -5.2, 2.6, 0, 4.4],
  ['tavern_barrel_2', 'barrel', -5.3, 3.5, 1, 4.2],
  ['tavern_crate', 'crate_big', -5.2, -0.8, 0.4, 4.5],
  ['tavern_hearth', 'build_campfire', 4.9, -3.6, 0, 1.1],
  ['tavern_lantern_1', 'build_lantern', -1.4, -3.9, 0, 0.9],
  ['tavern_lantern_2', 'build_lantern', 5.3, 3.9, 0, 0.9],
  ['tavern_bench', 'build_bench', -1.0, 3.6, 0, 0.8],
];
for (const [id, prefabId, lx, lz, yaw, scale, y = 0] of interior) {
  placements.push({
    id,
    prefabId,
    regionId: 'village',
    position: [round(INTERIOR.x + lx), y, round(INTERIOR.z + lz)],
    rotation: [0, Math.round(yaw * 1000) / 1000, 0],
    scale: [scale, scale, scale],
  });
}

writeFileSync('src/data/placements.json', JSON.stringify(placements, null, 2) + '\n');
console.log(`wrote ${placements.length} placements`);
