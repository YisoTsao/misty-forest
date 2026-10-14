// 任務 7A：晨曦谷地擴大（Bible §5.2，約 320 × 320 m）的 placement。由 gen-placements.ts 在舊內容之後呼叫。
// 手動配置的地標（農田聚落、燈塔、溪橋與水車、古樹遺跡、望星丘、南方營地、村莊外圍）＋ 各生態區的散佈 ＋ 邊界樹。
// 全部使用獨立的固定種子，結果可重現；舊物件只移除落在新道路上的，其餘 id 與位置不變。
import { readFileSync } from 'node:fs';
import { mulberry32 } from '../src/game-core/util/random.ts';
import { boundaryDistance, boundaryOutline } from '../src/game-core/world/bounds.ts';
import {
  BRANCH_ROADS,
  cliffZ,
  distanceToPath,
  distanceToRiver,
  FARMLAND,
  highlandWeight,
  LAKE,
  LEGACY_HALF_EXTENT,
  LIGHTHOUSE,
  MAIN_ROAD_NORTH,
  OVERLOOK_HILL,
  PATH_HALF_WIDTH,
  pathCenterX,
  polylineDistance,
  RIVER_BRIDGE,
  RIVER_FORDS,
  RIVER_HALF_WIDTH,
  RIVER_PATH,
  RUINS,
  SPAWN_POINT,
  TERRAIN_SIZE,
  terrainHeight,
  VILLAGE_CENTER,
  WATER_LEVEL,
} from '../src/game-core/world/terrain.ts';

type Taken = { x: number; z: number; r: number };
type Out = {
  id: string;
  prefabId: string;
  regionId: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
};

const round = (n: number) => Math.round(n * 100) / 100;
type RegionArea = { center: [number, number]; path?: [number, number][]; radius: number; blend: number };
const regions = JSON.parse(readFileSync('src/data/regions.json', 'utf8')) as { id: string; area?: RegionArea }[];

/**
 * 與 game-core 的 regionAt 相同規則（權重最大、同權重取範圍較小者）。
 * src 的模組以無副檔名互相 import，Node 無法直接執行，因此在腳本內重寫一份（worldData.test 會比對結果）。
 */
function regionAt(list: typeof regions, x: number, z: number): string {
  let best = 'meadow';
  let bestWeight = 0.5;
  let bestRadius = Infinity;
  for (const r of list) {
    if (!r.area) continue;
    const { center, path, radius, blend } = r.area;
    const d = path ? polylineDistance(x, z, path) : Math.hypot(x - center[0], z - center[1]);
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

function slopeAt(x: number, z: number): number {
  const dx = terrainHeight(x + 0.6, z) - terrainHeight(x - 0.6, z);
  const dz = terrainHeight(x, z + 0.6) - terrainHeight(x, z - 0.6);
  return Math.hypot(dx, dz) / 1.2;
}

export function addDawnvaleExpansion(placements: object[], taken: Taken[]): void {
  // ── 1. 舊物件：落在新支線道路上的移除（村莊、湖、寶箱、路標等手動配置的物件不動）──
  const keepPrefix = ['village_', 'lake_', 'meadow_chest', 'meadow_signpost', 'tavern_'];
  const before = placements.length;
  const kept = placements.filter((raw) => {
    const p = raw as Out;
    if (keepPrefix.some((k) => p.id.startsWith(k))) return true;
    const [x, , z] = p.position;
    if (x > 500) return true; // 室內子場景
    for (const road of BRANCH_ROADS) if (polylineDistance(x, z, road) < PATH_HALF_WIDTH + 1.2) return false;
    return true;
  });
  placements.length = 0;
  placements.push(...kept);
  console.log(`removed ${before - kept.length} legacy placements on the new roads`);

  const out: Out[] = [];
  const ids = new Set((placements as Out[]).map((p) => p.id));
  const push = (p: Out) => {
    if (ids.has(p.id)) throw new Error(`placement id 重複：${p.id}`);
    ids.add(p.id);
    out.push(p);
  };

  /** 手動配置一個物件：y 取地面高度（可加 dy）；face 為面向的世界座標（模型 +Z 朝向該點） */
  function place(
    id: string,
    prefabId: string,
    x: number,
    z: number,
    o: { scale?: number; yaw?: number; face?: [number, number]; dy?: number; y?: number; r?: number; region?: string } = {},
  ): void {
    const s = o.scale ?? 1;
    const yaw = o.face ? Math.atan2(o.face[0] - x, o.face[1] - z) : (o.yaw ?? 0);
    const y = o.y ?? terrainHeight(x, z) - 0.03 + (o.dy ?? 0);
    push({
      id,
      prefabId,
      regionId: o.region ?? regionAt(regions, x, z),
      position: [round(x), round(y), round(z)],
      rotation: [0, round(yaw), 0],
      scale: [s, s, s],
    });
    if (o.r !== undefined) taken.push({ x, z, r: o.r });
  }

  // ── 2. 地標與聚落（先放，散佈時避開）──
  // 2a. 西坊農田：三戶農家、藍色風車、農產攤位、玉米田與南瓜田（柵欄圍起）、麥田
  {
    const F = FARMLAND;
    const at = (dx: number, dz: number): [number, number] => [F.x + dx, F.z + dz];
    const c: [number, number] = [F.x, F.z];
    place('farm_house_01', 'house_tall_yellow', ...at(-9, -13), { scale: 5.2, face: c, r: 4 });
    place('farm_house_02', 'house_small_red', ...at(7, -15), { scale: 5.5, face: c, r: 3.5 });
    place('farm_house_03', 'house_tall_blue', ...at(-16, 4), { scale: 5.2, face: c, r: 4 });
    place('farm_windmill', 'windmill_blue', ...at(-20, -12), { scale: 6.5, face: c, r: 4 });
    place('farm_market', 'market', ...at(11, -3), { scale: 3.2, face: c, r: 3.5 });
    place('farm_well', 'well', ...at(-2, -4), { scale: 4, yaw: 0.6, r: 1.6 });
    // 玉米田：泥土畦 + 玉米，外圍柵欄
    let n = 0;
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 4; j++) {
        const [x, z] = at(3 + i * 2.1, 7 + j * 2.4);
        n++;
        place(`farm_corn_row_${String(n).padStart(2, '0')}`, 'k_dirt_row', x, z, { scale: 2.1, dy: 0.08 });
        place(`farm_corn_${String(n).padStart(2, '0')}`, 'k_corn', x, z, { scale: 2.3, yaw: (i * 7 + j * 3) % 4 });
      }
    }
    // 南瓜、西瓜、紅蘿蔔小田
    const crops = ['k_pumpkin', 'k_melon', 'k_carrot', 'k_leafy_crop'];
    n = 0;
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 3; j++) {
        const [x, z] = at(-12 + i * 2.1, 10 + j * 2.4);
        n++;
        place(`farm_patch_row_${String(n).padStart(2, '0')}`, 'k_dirt_row', x, z, { scale: 2.1, dy: 0.08 });
        place(`farm_patch_${String(n).padStart(2, '0')}`, crops[(i + j) % crops.length]!, x, z, { scale: 3, yaw: i * 1.3 + j });
      }
    }
    taken.push({ x: F.x - 7.8, z: F.z + 12.4, r: 7 }, { x: F.x + 8.3, z: F.z + 10.6, r: 8 });
    // 柵欄：玉米田外圍（Kenney 柵欄一段 1 m，放大 2.5 倍）
    n = 0;
    const fence = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const segs = Math.round(len / 2.5);
      const yaw = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
      for (let k = 0; k < segs; k++) {
        if (k === Math.floor(segs / 2) && z0 === z1 && z0 < F.z + 7) continue; // 北側留入口
        const t = (k + 0.5) / segs;
        n++;
        // 模型柵欄在局部 z = -0.5（乘縮放），往外推回中心線
        const x = x0 + (x1 - x0) * t;
        const z = z0 + (z1 - z0) * t;
        place(`farm_fence_${String(n).padStart(2, '0')}`, 'k_fence', x + Math.sin(yaw) * 1.25, z + Math.cos(yaw) * 1.25, { scale: 2.5, yaw });
      }
    };
    const [fx0, fz0] = at(1.2, 5.2);
    const [fx1, fz1] = at(15.6, 15.6);
    fence(fx0, fz0, fx1, fz0);
    fence(fx1, fz0, fx1, fz1);
    fence(fx1, fz1, fx0, fz1);
    fence(fx0, fz1, fx0, fz0);
    place('farm_grain_01', 'grain_field', ...at(-4, 22), { scale: 5, yaw: 0.2, r: 6 });
    place('farm_grain_02', 'grain_field', ...at(10, 24), { scale: 5, yaw: 0.7, r: 6 });
    // 雜物
    const props: [string, number, number, number, number][] = [
      ['barrel', -5, -9, 4.4, 0],
      ['barrel', -4.2, -9.8, 4.2, 1],
      ['sack', 9, -7, 4, 0.5],
      ['sack', 9.8, -6.4, 4, 1.4],
      ['crate_big', 13, -6, 4.5, 0.3],
      ['crate_open', 13.6, -4.6, 4.5, 1.1],
      ['wheelbarrow', 0, 4, 4.2, 2.2],
      ['k_log_stack_large', -20, -4, 3, 0.4],
      ['pallet', -2, -12, 4.5, 0.2],
      ['k_pumpkin', 12, -1, 2.6, 0.4],
      ['k_pumpkin', 10.6, -0.4, 2.2, 1.7],
    ];
    props.forEach(([prefab, dx, dz, s, yaw], i) => place(`farm_prop_${String(i + 1).padStart(2, '0')}`, prefab, ...at(dx, dz), { scale: s, yaw }));
    place('farm_signpost', 'signpost_farmland', -70, -23, { yaw: -0.4 });
  }

  // 2b. 晨風高地：晨曦燈塔、登山客營地、廢屋、懸崖腳下的岩柱
  {
    const L = LIGHTHOUSE;
    place('highland_lighthouse', 'lighthouse', L.x, L.z, { scale: 7, yaw: 0.3, r: 6 });
    place('highland_flag_01', 'flag_yellow', L.x + 5, L.z + 3, { scale: 6 });
    place('highland_flag_02', 'flag_blue', L.x - 4, L.z + 5, { scale: 6, yaw: 0.8 });
    place('highland_crate_01', 'crate_big', L.x + 4, L.z - 3, { scale: 4.5, yaw: 0.3 });
    place('highland_crate_02', 'crate_long', L.x + 4.6, L.z - 1.6, { scale: 4.5, yaw: 1.2 });
    place('highland_barrel_01', 'barrel', L.x - 3.6, L.z - 3.8, { scale: 4.4 });
    const top = { x: pathCenterX(MAIN_ROAD_NORTH) + 4, z: MAIN_ROAD_NORTH + 3 };
    place('highland_signpost', 'signpost_highland', top.x, top.z, { yaw: 0.3 });
    // 登山客營地
    const camp = { x: 24, z: -128 };
    place('highland_tent_01', 'k_tent', camp.x - 3, camp.z - 2, { scale: 4.5, face: [camp.x, camp.z], r: 2.5 });
    place('highland_tent_02', 'camp_tent', camp.x + 3.5, camp.z - 1.5, { scale: 6, face: [camp.x, camp.z], r: 2.5 });
    place('highland_fire_stones', 'k_campfire_stones', camp.x, camp.z + 1, { scale: 3 });
    place('highland_fire_logs', 'k_campfire_logs', camp.x, camp.z + 1, { scale: 3, dy: 0.1 });
    place('highland_seat_01', 'k_log', camp.x - 2.4, camp.z + 2.6, { scale: 4, yaw: 0.9 });
    place('highland_seat_02', 'k_log', camp.x + 2.4, camp.z + 3, { scale: 4, yaw: -0.8 });
    place('highland_pot', 'k_pot', camp.x + 1.2, camp.z - 0.8, { scale: 2.5 });
    taken.push({ x: camp.x, z: camp.z, r: 7 });
    // 被迷霧吞沒的廢屋
    place('highland_ruined_house', 'house_ruined', -78, -122, { scale: 5, yaw: 0.5, r: 5 });
    place('highland_ruined_lumber', 'lumber_pile', -72, -118, { scale: 4, yaw: 1.7 });
    // 懸崖腳下：岩柱與落石，讓崖面不只是光禿的斜坡（主路緩坡兩側 18 m 內不放）
    const cr = mulberry32(7101);
    let n = 0;
    for (let x = -144; x <= 66; x += 7 + cr() * 5) {
      if (Math.abs(x - pathCenterX(-100)) < 18) continue;
      const z = cliffZ(x) + 3 + cr() * 2;
      if (boundaryDistance(x, z) < 4) continue;
      n++;
      const prefab = ['k_rock_tall_a', 'k_rock_tall_b', 'k_stone_tall_a', 'k_rock_large_d'][Math.floor(cr() * 4)]!;
      place(`cliff_rock_${String(n).padStart(2, '0')}`, prefab, x, z, { scale: 4 + cr() * 3, yaw: cr() * 6.28, dy: -0.3, r: 2.5 });
    }
  }

  // 2c. 碎光溪：木橋、路標、水車、淺灘的踏腳石、獨木舟
  {
    const B = RIVER_BRIDGE;
    place('river_bridge', 'river_bridge', B.x, B.z, { yaw: Math.PI / 2, y: B.deckY, r: 8 });
    place('river_signpost', 'signpost_river', B.x - B.length / 2 - 4, B.z - 3.5, { yaw: 0.6 });
    place('river_watermill', 'watermill', 94.5, 30, { scale: 5, yaw: -Math.PI / 2, r: 5 });
    place('river_watermill_crates', 'crate_big', 92, 25.5, { scale: 4.4, yaw: 0.3 });
    place('river_watermill_sacks', 'sack', 91, 26.5, { scale: 4, yaw: 1 });
    place('river_canoe', 'k_canoe', 93.5, 8, { scale: 4, yaw: 0.25, dy: 0.05 });
    // 淺灘：一排踏腳石（溪床很淺，石頭露出水面）
    let n = 0;
    for (const f of RIVER_FORDS) {
      for (let k = -2; k <= 2; k++) {
        n++;
        place(`river_stepping_${String(n).padStart(2, '0')}`, n % 2 ? 'pebble_e' : 'pebble_d', f.x + k * 2.1, f.z + (n % 3) * 0.5 - 0.5, {
          scale: 5,
          yaw: n * 1.7,
          y: WATER_LEVEL - 0.12,
        });
      }
    }
  }

  // 2d. 古樹遺跡：中央的古樹、一圈石柱、倒下的石像、石環入口、寶箱
  {
    const R = RUINS;
    place('ruins_ancient_tree', 'ancient_tree', R.x, R.z, { scale: 15, yaw: 0.4, r: 4 });
    const cr = mulberry32(7203);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.2;
      // 西側（道路進來的方向）留給石環入口
      if (Math.abs(Math.atan2(Math.sin(a - Math.PI * 1.08), Math.cos(a - Math.PI * 1.08))) < 0.3) continue;
      const broken = cr() < 0.45;
      place(`ruins_column_${String(i + 1).padStart(2, '0')}`, broken ? 'k_column_broken' : 'k_column', R.x + Math.cos(a) * 11, R.z + Math.sin(a) * 11, {
        scale: 5.5,
        yaw: cr() * 6.28,
        r: 1.5,
      });
    }
    place('ruins_gate', 'k_stone_ring', R.x - 12.2, R.z - 3.3, { scale: 6, face: [R.x, R.z], r: 2 });
    place('ruins_obelisk_01', 'k_obelisk', R.x + 5, R.z - 6, { scale: 6, yaw: 0.3, r: 1.5 });
    place('ruins_obelisk_02', 'k_obelisk', R.x - 4, R.z + 7, { scale: 5, yaw: 1.1, r: 1.5 });
    place('ruins_head', 'k_statue_head', R.x + 7, R.z + 5, { scale: 4.5, yaw: -2.3, r: 2.5 });
    place('ruins_block_01', 'k_statue_block', R.x - 6, R.z - 6, { scale: 4, yaw: 0.6, r: 1.5 });
    place('ruins_block_02', 'k_statue_block', R.x - 7.4, R.z - 4.6, { scale: 3, yaw: 1.4, r: 1 });
    place('ruins_house', 'house_ruined', R.x + 3, R.z + 18, { scale: 4.5, yaw: 2.6, r: 4 });
    place('ruins_log', 'k_log_large', R.x - 8, R.z + 4, { scale: 5, yaw: 1.9, r: 2.5 });
    place('ruins_chest', 'chest_ruins', R.x + 4.2, R.z + 2.6, { scale: 0.55, yaw: -1.2, r: 2 });
    place('ruins_signpost', 'signpost_ruins', 44, 96.5, { yaw: -0.8 });
  }

  // 2e. 望星丘：山頂的長椅、燈、旗子與隱藏寶箱；山腳的路標
  {
    const H = OVERLOOK_HILL;
    place('overlook_bench', 'build_bench', H.x + 1.5, H.z - 2, { scale: 0.9, face: [H.x + 20, H.z - 60], r: 1.5 });
    place('overlook_lantern_01', 'build_lantern', H.x - 1.5, H.z - 3, { scale: 0.9, r: 0.6 });
    place('overlook_lantern_02', 'build_lantern', H.x + 4.5, H.z - 1, { scale: 0.9, r: 0.6 });
    place('overlook_flag', 'flag_yellow', H.x - 2.5, H.z + 2.5, { scale: 7, yaw: 0.7 });
    place('overlook_ring', 'k_stone_ring', H.x + 3, H.z + 4, { scale: 4.5, yaw: 2.2, r: 1.5 });
    place('overlook_rock_01', 'k_rock_large_b', H.x - 5, H.z + 5.5, { scale: 4, yaw: 0.4, r: 2 });
    place('overlook_rock_02', 'k_rock_tall_b', H.x - 6.5, H.z + 3.2, { scale: 3.5, yaw: 1.4, r: 2 });
    place('overlook_chest', 'chest_hidden', H.x - 4.6, H.z + 3.4, { scale: 0.55, face: [H.x, H.z], r: 1.5 });
    place('overlook_signpost', 'signpost_overlook', -64, 83, { yaw: 0.9 });
    taken.push({ x: H.x, z: H.z, r: 8 });
  }

  // 2f. 南方道路與旅人營地
  {
    const camp = { x: 16, z: 120 };
    place('south_tent_01', 'k_tent', camp.x - 3.5, camp.z - 2, { scale: 4.5, face: [camp.x, camp.z], r: 2.5 });
    place('south_tent_02', 'k_tent_small', camp.x + 3.2, camp.z - 2.6, { scale: 4.5, face: [camp.x, camp.z], r: 2 });
    place('south_tent_03', 'camp_tent', camp.x + 0.5, camp.z - 5, { scale: 6, face: [camp.x, camp.z], r: 2.5 });
    place('south_fire_stones', 'k_campfire_stones', camp.x, camp.z + 0.5, { scale: 3 });
    place('south_fire_logs', 'k_campfire_logs', camp.x, camp.z + 0.5, { scale: 3, dy: 0.1 });
    place('south_seat_01', 'k_log', camp.x - 2.6, camp.z + 2, { scale: 4, yaw: 1.1 });
    place('south_seat_02', 'k_log', camp.x + 2.6, camp.z + 2.4, { scale: 4, yaw: -1.0 });
    place('south_crate', 'crate_big', camp.x + 5.5, camp.z, { scale: 4.4, yaw: 0.5 });
    place('south_barrel', 'barrel', camp.x + 5.2, camp.z + 1.4, { scale: 4.2 });
    place('south_weapon_rack', 'weapon_rack', camp.x - 6, camp.z - 0.5, { scale: 5, yaw: 1.5 });
    place('south_target', 'archery_target', camp.x - 8, camp.z + 6, { scale: 6, face: [camp.x - 8, camp.z - 4] });
    taken.push({ x: camp.x, z: camp.z, r: 9 });
    place('south_signpost', 'signpost_south', pathCenterX(96) + 3.2, 96, { yaw: 0.2 });
  }

  // 2g. 村莊外圍：波木的木工坊、鐵匠鋪、村子北邊的大橡樹、倒下的大樹與隱藏寶箱（Bible §5.8）
  {
    const V = VILLAGE_CENTER;
    place('village_lumbermill', 'lumbermill', V.x - 22, V.z - 18, { scale: 4.5, face: [V.x, V.z - 8], r: 4.5 });
    place('village_lumber_02', 'k_log_stack_large', V.x - 17, V.z - 22, { scale: 3, yaw: 0.3, r: 1.5 });
    place('village_blacksmith', 'blacksmith', V.x + 21, V.z + 3, { scale: 4.2, face: [V.x, V.z + 3], r: 4.5 });
    place('village_anvil_crate', 'crate_long', V.x + 17.5, V.z + 7, { scale: 4.5, yaw: 0.2 });
    place('village_weapon_rack', 'weapon_rack', V.x + 18, V.z - 2.5, { scale: 5, yaw: -1.4 });
    place('village_great_oak', 'great_oak', V.x - 6, V.z - 26, { scale: 10, yaw: 0.8, r: 3 });
    place('village_fallen_tree', 'k_log_large', V.x - 14, V.z - 30, { scale: 6.5, yaw: 0.35, r: 4 });
    place('village_fallen_stump', 'k_stump_old_tall', V.x - 17.5, V.z - 31.5, { scale: 6, yaw: 1.2, r: 2 });
    place('chest_dawn_hidden_01', 'chest_hidden', V.x - 15.2, V.z - 27.8, { scale: 0.55, yaw: 2.6, r: 1.5 });
  }

  // ── 3. 各生態區的散佈 ──
  const sr = mulberry32(20261014);
  let nextScatter = 0;
  function scatter(opts: {
    prefix: string;
    count: number;
    prefabs: readonly string[];
    spacing: number;
    scale: [number, number];
    /** 圓形範圍；省略時為整張地圖 */
    area?: { x: number; z: number; r: number };
    /** 額外條件（例如只在高地、只在舊地圖外） */
    where?: (x: number, z: number) => boolean;
    maxSlope?: number;
    /** 不登記占用（不擋其他物件，例如小草叢） */
    loose?: boolean;
    dy?: number;
  }): void {
    let placed = 0;
    let attempts = 0;
    const halfMap = TERRAIN_SIZE / 2;
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
        x = (sr() * 2 - 1) * halfMap;
        z = (sr() * 2 - 1) * halfMap;
      }
      if (boundaryDistance(x, z) < 2.5) continue;
      if (opts.where && !opts.where(x, z)) continue;
      if (Math.hypot(x - SPAWN_POINT.x, z - SPAWN_POINT.z) < 14) continue;
      if (Math.hypot(x - VILLAGE_CENTER.x, z - VILLAGE_CENTER.z) < 20) continue;
      if (distanceToPath(x, z) < PATH_HALF_WIDTH + 1.6) continue;
      if (terrainHeight(x, z) < WATER_LEVEL + 0.5) continue;
      if (distanceToRiver(x, z) < RIVER_HALF_WIDTH + 1.5) continue;
      if (slopeAt(x, z) > (opts.maxSlope ?? 0.75)) continue;
      if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + opts.spacing)) continue;
      if (!opts.loose) taken.push({ x, z, r: opts.spacing });
      placed++;
      nextScatter++;
      const s = opts.scale[0] + sr() * (opts.scale[1] - opts.scale[0]);
      push({
        id: `${opts.prefix}_${String(placed).padStart(3, '0')}`,
        prefabId: opts.prefabs[Math.floor(sr() * opts.prefabs.length)]!,
        regionId: regionAt(regions, x, z),
        position: [round(x), round(terrainHeight(x, z) - 0.05 + (opts.dy ?? 0)), round(z)],
        rotation: [0, round(sr() * Math.PI * 2), 0],
        scale: [round(s), round(s * (0.9 + sr() * 0.25)), round(s)],
      });
    }
    if (placed < opts.count) console.warn(`scatter ${opts.prefix}: placed ${placed}/${opts.count}`);
  }
  const outsideLegacy = (x: number, z: number) => Math.max(Math.abs(x), Math.abs(z)) > LEGACY_HALF_EXTENT - 2;
  const onHighland = (x: number, z: number) => highlandWeight(x, z) > 0.95;
  const lowland = (x: number, z: number) => highlandWeight(x, z) < 0.05;
  const keepClear = (x: number, z: number) =>
    Math.hypot(x - FARMLAND.x, z - FARMLAND.z) > FARMLAND.radius + 2 &&
    Math.hypot(x - RUINS.x, z - RUINS.z) > RUINS.radius - 1 &&
    Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z) > 12;

  // 高地：針葉林與岩石
  scatter({
    prefix: 'highland_tree',
    count: 150,
    prefabs: ['k_pine_tall_a', 'k_pine_tall_b', 'k_pine_round_a', 'k_pine_round_c', 'k_tree_cone', 'k_tree_cone_dark', 'k_tree_tall_dark'],
    spacing: 2.2,
    scale: [4.5, 7],
    where: (x, z) => onHighland(x, z) && keepClear(x, z),
  });
  scatter({ prefix: 'highland_rock', count: 26, prefabs: ['k_rock_tall_c', 'k_rock_tall_e', 'k_rock_tall_c'], spacing: 1.6, scale: [4, 6], where: (x, z) => onHighland(x, z) && keepClear(x, z) });
  scatter({ prefix: 'highland_boulder', count: 18, prefabs: ['k_rock_large_a', 'k_rock_large_b', 'k_rock_large_c', 'k_rock_tall_b'], spacing: 2.4, scale: [3.5, 6], where: onHighland });

  // 霧林深處（東北，延伸舊森林）：闊葉與暗色針葉混合、倒木、樹樁、蘑菇
  const deepForest = { x: 80, z: -82, r: 44 };
  scatter({
    prefix: 'deepwood_tree',
    count: 150,
    prefabs: ['tree_tall', 'tree_round', 'k_tree_detailed', 'k_pine_round_a', 'k_tree_cone_dark', 'k_oak', 'k_tree_tall_dark', 'k_tree_fat'],
    spacing: 2.1,
    scale: [5, 7.5],
    area: deepForest,
    where: (x, z) => outsideLegacy(x, z) && lowland(x, z),
  });
  scatter({ prefix: 'deepwood_log', count: 14, prefabs: ['k_log_large', 'k_log', 'k_stump_old', 'k_stump_old_tall'], spacing: 2, scale: [4, 6], area: deepForest });
  scatter({ prefix: 'deepwood_mushroom', count: 40, prefabs: ['k_mushroom_red', 'k_mushroom_group', 'k_mushroom_tan', 'k_mushroom_tall'], spacing: 0.8, scale: [4, 7], area: deepForest, loose: true });
  scatter({ prefix: 'deepwood_herb', count: 10, prefabs: ['herb_bush'], spacing: 1.2, scale: [1.8, 2.2], area: deepForest });

  // 西邊：農田外圍的橡樹林與果樹
  scatter({
    prefix: 'west_tree',
    count: 90,
    prefabs: ['k_oak', 'k_tree_default', 'k_tree_plateau', 'tree_round', 'k_tree_fat'],
    spacing: 2,
    scale: [4.5, 7],
    where: (x, z) => x < -LEGACY_HALF_EXTENT + 4 && lowland(x, z) && keepClear(x, z),
  });

  // 南邊：開闊草原上的秋色樹與零星橡樹
  scatter({
    prefix: 'south_tree',
    count: 90,
    prefabs: ['k_oak_fall', 'k_tree_default_fall', 'k_tree_fat_fall', 'k_tree_blocks_fall', 'k_oak', 'tree_round'],
    spacing: 2.2,
    scale: [4.5, 7],
    where: (x, z) => z > LEGACY_HALF_EXTENT - 2 && keepClear(x, z),
  });

  // 東邊（溪的兩岸與對岸荒野）
  scatter({
    prefix: 'east_tree',
    count: 110,
    prefabs: ['k_tree_plateau', 'k_tree_detailed', 'k_oak', 'k_tree_simple', 'tree_tall', 'k_tree_cone'],
    spacing: 2.1,
    scale: [4.5, 7],
    where: (x, z) => x > LEGACY_HALF_EXTENT - 2 && z > -40 && lowland(x, z) && keepClear(x, z),
  });

  // 全圖點綴：灌木、草叢、小花（無碰撞）、裝飾岩石與可敲的石頭
  scatter({ prefix: 'bush', count: 260, prefabs: ['k_bush', 'k_bush_large', 'k_bush_detailed', 'k_bush_small'], spacing: 1, scale: [4, 7], where: (x, z) => keepClear(x, z) || outsideLegacy(x, z), loose: true });
  scatter({ prefix: 'grass_clump', count: 220, prefabs: ['k_grass_large', 'k_grass_leafs'], spacing: 0.8, scale: [4, 6], loose: true });
  scatter({ prefix: 'wildflower', count: 160, prefabs: ['k_flower_red', 'k_flower_purple', 'k_flower_yellow'], spacing: 0.5, scale: [4, 6], where: outsideLegacy, loose: true });
  scatter({ prefix: 'boulder', count: 60, prefabs: ['k_rock_large_a', 'k_rock_large_b', 'k_rock_large_c', 'k_rock_tall_b', 'k_stone_tall_b'], spacing: 2.2, scale: [3, 5.5], where: (x, z) => outsideLegacy(x, z) && keepClear(x, z) });
  scatter({ prefix: 'stone_node', count: 30, prefabs: ['k_rock_tall_c', 'k_rock_tall_e'], spacing: 1.6, scale: [3.5, 5], where: outsideLegacy });
  scatter({ prefix: 'valley_flower', count: 30, prefabs: ['flower_patch'], spacing: 1.2, scale: [1.9, 2.3], where: (x, z) => outsideLegacy(x, z) && lowland(x, z) });
  scatter({ prefix: 'valley_herb', count: 20, prefabs: ['herb_bush'], spacing: 1.2, scale: [1.8, 2.2], where: outsideLegacy });
  scatter({ prefix: 'ruins_mushroom', count: 30, prefabs: ['k_mushroom_red', 'k_mushroom_group', 'k_mushroom_tall'], spacing: 0.6, scale: [5, 8], area: { x: RUINS.x, z: RUINS.z, r: 22 }, loose: true });
  scatter({ prefix: 'ruins_tree', count: 24, prefabs: ['k_tree_detailed', 'k_oak', 'k_tree_fat'], spacing: 2.4, scale: [5.5, 8], area: { x: RUINS.x, z: RUINS.z, r: 30 }, where: keepClear });

  // 溪岸的草叢、湖與溪的睡蓮（水面上）
  scatter({
    prefix: 'riverbank_reed',
    count: 70,
    prefabs: ['k_grass_leafs', 'k_grass_large', 'k_bush_small'],
    spacing: 0.8,
    scale: [4, 6],
    where: (x, z) => distanceToRiver(x, z) < RIVER_HALF_WIDTH + 5,
    maxSlope: 1.2,
    loose: true,
  });
  {
    const lr = mulberry32(7307);
    let n = 0;
    const lily = (x: number, z: number) => {
      n++;
      push({
        id: `water_lily_${String(n).padStart(3, '0')}`,
        prefabId: lr() < 0.5 ? 'k_lily_large' : lr() < 0.5 ? 'k_lily_small' : 'water_lily',
        regionId: regionAt(regions, x, z),
        position: [round(x), WATER_LEVEL + 0.02, round(z)],
        rotation: [0, round(lr() * Math.PI * 2), 0],
        scale: [4.5, 4.5, 4.5].map((v) => round(v * (0.7 + lr() * 0.6))) as [number, number, number],
      });
    };
    for (let i = 0; i < 26; i++) {
      // 溪：靠岸的緩流處（避開淺灘與橋）
      const seg = Math.floor(lr() * (RIVER_PATH.length - 1));
      const [ax, az] = RIVER_PATH[seg]!;
      const [bx, bz] = RIVER_PATH[seg + 1]!;
      const t = lr();
      const side = lr() < 0.5 ? -1 : 1;
      const len = Math.hypot(bx - ax, bz - az);
      const x = ax + (bx - ax) * t + (-(bz - az) / len) * side * (1.5 + lr() * 1.8);
      const z = az + (bz - az) * t + ((bx - ax) / len) * side * (1.5 + lr() * 1.8);
      if (boundaryDistance(x, z) < 6) continue;
      if (Math.hypot(x - RIVER_BRIDGE.x, z - RIVER_BRIDGE.z) < 9) continue;
      if (RIVER_FORDS.some((f) => Math.hypot(x - f.x, z - f.z) < 8)) continue;
      if (terrainHeight(x, z) > WATER_LEVEL - 0.6) continue;
      lily(x, z);
    }
    for (let i = 0; i < 18; i++) {
      // 湖：南岸與東岸（避開木橋與小島）
      const a = 0.2 + lr() * 2.6;
      const r = LAKE.radius - 3.5 - lr() * 3;
      const x = LAKE.x + Math.cos(a) * r;
      const z = LAKE.z + Math.sin(a) * r;
      if (Math.hypot(x - 37.5, z - 8) < 9) continue;
      if (terrainHeight(x, z) > WATER_LEVEL - 0.6) continue;
      lily(x, z);
    }
  }

  // ── 4. 地圖邊界：迷霧牆外兩排裝飾樹（任務 6A 的做法，套用到新邊界）──
  {
    const edgeRand = mulberry32(20261013);
    const outline = boundaryOutline(3.4, 8, 0);
    let n = 0;
    for (const p of outline) {
      for (const [from, to] of [
        [2, 4],
        [5, 8],
      ] as const) {
        if (edgeRand() < 0.25) continue;
        const len = Math.hypot(p.x, p.z);
        const pushOut = from + edgeRand() * (to - from);
        const jitter = (edgeRand() - 0.5) * 2.4;
        const x = p.x + (p.x / len) * pushOut + (-p.z / len) * jitter;
        const z = p.z + (p.z / len) * pushOut + (p.x / len) * jitter;
        if (Math.max(Math.abs(x), Math.abs(z)) > TERRAIN_SIZE / 2 - 0.5) continue;
        if (boundaryDistance(x, z) > -1.5) continue;
        if (distanceToRiver(x, z) < RIVER_HALF_WIDTH + 2) continue;
        n++;
        const s = 5 + edgeRand() * 2.8;
        const kind = edgeRand();
        push({
          id: `edge_tree_${String(n).padStart(3, '0')}`,
          prefabId: kind < 0.35 ? 'tree_edge_tall' : kind < 0.55 ? 'tree_edge_round' : kind < 0.8 ? 'k_edge_pine' : 'k_edge_cone',
          regionId: regionAt(regions, x, z),
          position: [round(x), round(terrainHeight(x, z) - 0.05), round(z)],
          rotation: [0, round(edgeRand() * Math.PI * 2), 0],
          scale: [round(s), round(s * (0.9 + edgeRand() * 0.25)), round(s)],
        });
      }
    }
    console.log(`placed ${n} boundary trees`);
  }

  // ── 5. 任務 7D「燈塔的最後一盞光」（Bible §5.4 quest_dawn_003）：燈塔頂的燈籠室、迷霧核心、三片燈罩碎片 ──
  // 附加在最後，既有物件的 id 與位置不變；只移除與新物件重疊的散佈點綴。
  {
    const L = LIGHTHOUSE;
    const questOut: Out[] = [];
    const clear: Taken[] = [];
    const quest = (id: string, prefabId: string, x: number, z: number, o: { y?: number; yaw?: number; r: number }) => {
      questOut.push({
        id,
        prefabId,
        regionId: regionAt(regions, x, z),
        position: [round(x), round(o.y ?? terrainHeight(x, z) - 0.03), round(z)],
        rotation: [0, round(o.yaw ?? 0), 0],
        scale: [1, 1, 1],
      });
      clear.push({ x, z, r: o.r });
    };
    // 燈籠室在塔頂（燈塔模型 2.19 單位高 × 縮放 7）
    quest('highland_lighthouse_lamp', 'lighthouse_lamp', L.x, L.z, { y: terrainHeight(L.x, L.z) - 0.03 + LIGHTHOUSE_TOP, r: 0 });
    quest('highland_mist_core', 'mist_core', MIST_CORE.x, MIST_CORE.z, { r: 3 });
    LANTERN_SHARDS.forEach(([x, z], i) => quest(`highland_lantern_shard_${String(i + 1).padStart(2, '0')}`, 'lantern_shard', x, z, { yaw: i * 2.1, r: 1.2 }));
    // 任務 7E 霧團噗啾王：戰場邊的星光鏡（鏡面朝向燈塔），戰場內清空散佈的樹與石頭
    quest('highland_star_mirror', 'star_mirror', PUFF_ARENA.x - PUFF_ARENA.r - 1, PUFF_ARENA.z - 2, { yaw: Math.atan2(L.x - (PUFF_ARENA.x - PUFF_ARENA.r - 1), L.z - (PUFF_ARENA.z - 2)), r: 1.5 });
    clear.push({ x: PUFF_ARENA.x, z: PUFF_ARENA.z, r: PUFF_ARENA.r + 1 });
    // 任務 7G 送信：村子裡的兩籃乾布（曬衣繩下、黃色小屋旁）
    DRY_CLOTH.forEach(([x, z], i) => quest(`village_dry_cloth_${String(i + 1).padStart(2, '0')}`, 'dry_cloth', x, z, { yaw: i * 1.3, r: 0.8 }));
    const scatterId = /^(?!edge_tree_)[a-z_]+_\d{3}$/;
    const before = out.length;
    const kept = out.filter((o) => !scatterId.test(o.id) || !clear.some((c) => Math.hypot(c.x - o.position[0], c.z - o.position[2]) < c.r + 0.6));
    console.log(`quest 7D: removed ${before - kept.length} scattered placements overlapping ${questOut.length} quest objects`);
    out.length = 0;
    out.push(...kept);
    for (const o of questOut) push(o);
  }

  placements.push(...out);
  console.log(`added ${out.length} dawnvale expansion placements (${nextScatter} scattered)`);
}

/** 任務 7D：燈塔頂（燈籠室的原點）離地高度、迷霧核心、三片燈罩碎片（登山客營地、廢屋、燈塔後面） */
const LIGHTHOUSE_TOP = 15.3;
const MIST_CORE = { x: LIGHTHOUSE.x + 8.5, z: LIGHTHOUSE.z + 7.5 } as const;
/** 任務 7G：兩籃乾布 */
const DRY_CLOTH: readonly [number, number][] = [
  [-21.4, -22.4],
  [-0.6, -42.6],
];
/** 任務 7E：霧團噗啾王的戰場（燈塔東邊的平地） */
const PUFF_ARENA = { x: -4, z: -118, r: 13 } as const;
const LANTERN_SHARDS: readonly [number, number][] = [
  [28.5, -122.5],
  [-73, -126.5],
  [LIGHTHOUSE.x - 13, LIGHTHOUSE.z - 9],
];
