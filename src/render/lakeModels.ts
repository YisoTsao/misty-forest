import * as THREE from 'three';
import { mulberry32 } from '@/game-core/util/random';
import { cylinder, glowColor, leaf, merge, paint, sphere, type ForestModel } from './forestModels';

/**
 * 澄鏡湖的程式模型（任務 9A，Bible §7.3、§7.7）：蘆葦叢、月弧木橋、木碼頭、湖畔漁屋、水鏡、半沉沒鐘樓、水鏡神殿、燈船。
 * 與其他地圖的程式模型相同，分成 solid / plant / glow 三種部件。
 * 配色依 Bible：湖水藍 #77C9DF、薄霧白 #D9F1F4、水草綠 #7BB49C；木頭偏淺的灰棕（湖邊曬過的木頭）。
 */
const c = (hex: string) => new THREE.Color(hex);
const WOOD = c('#a07a55');
const WOOD_DARK = c('#7a5a3e');
const WOOD_GREY = c('#9a8f80');
const STONE = c('#b9bdb8');
const STONE_DARK = c('#8f9894');
const MOSS = c('#7bb49c');
const LAKE_BLUE = '#77c9df';
const MIST_WHITE = '#d9f1f4';

function box(size: [number, number, number], at: [number, number, number], color: THREE.Color, rot: [number, number, number] = [0, 0, 0]): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(...size);
  g.rotateX(rot[0]);
  g.rotateY(rot[1]);
  g.rotateZ(rot[2]);
  g.translate(...at);
  return paint(g, color);
}

/** 蘆葦叢（`plant_lake_reed`）：一叢細長的葉片，幾根頂端有褐色的香蒲穗 */
function lakeReeds(): ForestModel {
  const rand = mulberry32(901);
  const plant: THREE.BufferGeometry[] = [];
  const solid: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 22; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 0.55;
    const len = 1.1 + rand() * 0.8;
    plant.push(leaf(a, len, 0.035 + rand() * 0.02, 1.25 + rand() * 0.2, c('#4f8a66'), c('#a8d08a')).translate(Math.cos(a) * r, 0, Math.sin(a) * r));
  }
  for (let i = 0; i < 5; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 0.4;
    const h = 1.3 + rand() * 0.5;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    solid.push(cylinder(0.012, 0.016, h, [x, 0, z], c('#6f9a62'), 4));
    solid.push(sphere(0.045, [x, h + 0.12, z], c('#7a5233'), [1, 3.2, 1], 0));
  }
  return { solid: merge(solid, '香蒲'), plant: merge(plant, '蘆葦') };
}

/** 月弧木橋（`prop_lake_moon_bridge`）：沿 +Z 架設、中央拱起的木橋；長度與拱高見 MOON_BRIDGE_SPAN */
export const MOON_BRIDGE_SPAN = { length: 20, rise: 1.6, width: 2.6 } as const;
/** 橋面在 z（局部座標，−length/2 … length/2）處的高度 */
export function moonBridgeDeckY(z: number): number {
  return MOON_BRIDGE_SPAN.rise * Math.cos((Math.PI * z) / MOON_BRIDGE_SPAN.length);
}
function moonBridge(): ForestModel {
  const { length, width } = MOON_BRIDGE_SPAN;
  const solid: THREE.BufferGeometry[] = [];
  const planks = 28;
  for (let i = 0; i < planks; i++) {
    const z = -length / 2 + (i + 0.5) * (length / planks);
    const y = moonBridgeDeckY(z);
    const slope = Math.atan(-((MOON_BRIDGE_SPAN.rise * Math.PI) / length) * Math.sin((Math.PI * z) / length));
    solid.push(box([width, 0.12, length / planks - 0.05], [0, y, z], i % 2 ? WOOD : WOOD_GREY, [-slope, 0, 0]));
  }
  // 兩側的拱樑與欄杆
  for (const side of [-1, 1]) {
    const beam: THREE.Vector3[] = [];
    const rail: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++) {
      const z = -length / 2 + (i / 16) * length;
      beam.push(new THREE.Vector3((side * width) / 2, moonBridgeDeckY(z) - 0.12, z));
      rail.push(new THREE.Vector3((side * width) / 2, moonBridgeDeckY(z) + 0.85, z));
    }
    solid.push(paint(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(beam), 24, 0.11, 6), WOOD_DARK));
    solid.push(paint(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail), 24, 0.06, 6), WOOD));
    for (let i = 0; i <= 8; i++) {
      const z = -length / 2 + (i / 8) * length;
      solid.push(cylinder(0.06, 0.07, 0.95, [(side * width) / 2, moonBridgeDeckY(z) - 0.05, z], WOOD_DARK, 6));
    }
    // 兩端與中段的橋墩（插進水裡）
    for (const z of [-length * 0.32, 0, length * 0.32]) solid.push(cylinder(0.16, 0.2, 4.2, [(side * width) / 2, moonBridgeDeckY(z) - 4.2, z], WOOD_DARK, 7));
  }
  // 橋頂的一對小燈（月弧的意象：淡藍白的光）
  const glow: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    solid.push(cylinder(0.05, 0.05, 0.5, [(side * width) / 2, moonBridgeDeckY(0) + 0.85, 0], WOOD_DARK, 5));
    glow.push(sphere(0.13, [(side * width) / 2, moonBridgeDeckY(0) + 1.45, 0], glowColor(MIST_WHITE, 1.8), [1, 1.2, 1], 1));
  }
  return { solid: merge(solid, '月弧木橋'), glow: merge(glow, '月弧木橋的燈') };
}

/** 木碼頭（`prop_lake_wooddock`）：沿 +Z 伸進湖裡，橋面在原點上方 0.3 m，長 10 m */
function woodDock(): ForestModel {
  const solid: THREE.BufferGeometry[] = [];
  const len = 10;
  for (let i = 0; i < 20; i++) solid.push(box([2.4, 0.1, 0.46], [0, 0.3, (i + 0.5) * (len / 20)], i % 3 ? WOOD : WOOD_GREY));
  for (const side of [-1, 1]) {
    solid.push(box([0.14, 0.14, len], [side * 1.12, 0.2, len / 2], WOOD_DARK));
    for (let k = 0; k <= 4; k++) solid.push(cylinder(0.12, 0.13, 3.6, [side * 1.1, -3.2, (k / 4) * len], WOOD_DARK, 7));
  }
  // 末端的繫船柱與一捲繩子
  solid.push(cylinder(0.14, 0.14, 0.7, [0.9, 0.3, len - 0.3], WOOD_DARK, 7));
  const rope = new THREE.TorusGeometry(0.18, 0.05, 5, 12);
  rope.rotateX(Math.PI / 2);
  rope.translate(-0.7, 0.42, len - 0.6);
  solid.push(paint(rope, c('#d8c79a')));
  return { solid: merge(solid, '木碼頭') };
}

/** 湖畔漁屋（`building_lake_fisher_hut`）：架在矮木樁上的小木屋，藍色門窗、斜屋頂、門前曬著漁網；門朝 +Z */
function fisherHut(): ForestModel {
  const solid: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  // 木樁平台
  for (const x of [-2.4, 2.4]) for (const z of [-1.9, 1.9]) solid.push(cylinder(0.16, 0.18, 0.7, [x, -0.2, z], WOOD_DARK, 7));
  solid.push(box([5.4, 0.18, 4.4], [0, 0.5, 0], WOOD_GREY));
  solid.push(box([5.4, 0.12, 1.6], [0, 0.5, 2.9], WOOD));
  // 牆（橫木板）
  for (let k = 0; k < 7; k++) {
    const y = 0.8 + k * 0.32;
    const col = k % 2 ? WOOD : c('#b08a62');
    solid.push(box([4.6, 0.3, 0.12], [0, y, 1.75], col), box([4.6, 0.3, 0.12], [0, y, -1.75], col), box([0.12, 0.3, 3.5], [2.3, y, 0], col), box([0.12, 0.3, 3.5], [-2.3, y, 0], col));
  }
  // 斜屋頂（兩片）與屋脊
  for (const side of [-1, 1]) solid.push(box([5.4, 0.16, 2.6], [0, 3.45, side * 1.05], c('#4f7f9a'), [side * 0.55, 0, 0]));
  solid.push(box([5.5, 0.18, 0.3], [0, 4.05, 0], c('#3f667c')));
  // 山牆
  const gable = new THREE.BufferGeometry();
  const gy = 3.04;
  gable.setAttribute('position', new THREE.Float32BufferAttribute([0, gy, -1.75, 0, gy, 1.75, 0, 4.0, 0], 3));
  gable.computeVertexNormals();
  for (const x of [2.32, -2.32]) solid.push(paint(gable.clone().translate(x, 0, 0), WOOD));
  solid.push(paint(gable.clone().rotateY(Math.PI).translate(2.32, 0, 0), WOOD), paint(gable.clone().rotateY(Math.PI).translate(-2.32, 0, 0), WOOD));
  gable.dispose();
  // 門、窗（湖藍）
  solid.push(box([1.0, 1.8, 0.08], [-0.8, 1.55, 1.83], c('#3f8fae')));
  solid.push(box([0.9, 0.7, 0.08], [1.1, 1.9, 1.83], c('#3f667c')));
  glow.push(box([0.72, 0.52, 0.04], [1.1, 1.9, 1.87], glowColor('#ffd89a', 1.2)));
  // 屋頂上的小煙囪、牆邊的漁網架與魚簍
  solid.push(box([0.4, 0.9, 0.4], [1.5, 3.9, -0.7], STONE_DARK));
  solid.push(cylinder(0.05, 0.05, 1.6, [2.9, 0.5, 2.2], WOOD_DARK, 5), cylinder(0.05, 0.05, 1.6, [2.9, 0.5, 0.2], WOOD_DARK, 5));
  const net = new THREE.PlaneGeometry(1.9, 1.1, 4, 3);
  net.rotateY(Math.PI / 2);
  net.translate(2.95, 1.45, 1.2);
  solid.push(paint(net, c('#c9c0a0')));
  solid.push(cylinder(0.32, 0.25, 0.5, [-2.0, 0.6, 2.9], c('#b89a62'), 9));
  return { solid: merge(solid, '湖畔漁屋'), glow: merge(glow, '漁屋窗光') };
}

/** 半沉沒的鐘樓（`ruin_lake_submerged_tower`）：原點在湖底，石塔斜斜插在湖裡，頂端的鐘亭露出水面 */
function sunkenTower(): ForestModel {
  const rand = mulberry32(907);
  const solid: THREE.BufferGeometry[] = [];
  const tilt = 0.2;
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 8; k++) parts.push(box([2.6 - k * 0.04, 0.95, 2.6 - k * 0.04], [0, 0.5 + k * 1.0, 0], k % 2 ? STONE : c('#aeb3ad')));
  // 鐘亭：四根柱子、尖屋頂、鐘
  for (const x of [-1, 1]) for (const z of [-1, 1]) parts.push(box([0.3, 1.8, 0.3], [x * 1.05, 8.9, z * 1.05], STONE));
  const roof = new THREE.ConeGeometry(2.1, 1.7, 4);
  roof.rotateY(Math.PI / 4);
  roof.translate(0, 10.6, 0);
  parts.push(paint(roof, c('#5f8a8f')));
  parts.push(box([2.8, 0.25, 2.8], [0, 9.85, 0], STONE_DARK));
  const bell = new THREE.CylinderGeometry(0.35, 0.6, 0.8, 10, 1, true);
  bell.translate(0, 9.25, 0);
  parts.push(paint(bell, c('#b08d4a')));
  parts.push(sphere(0.12, [0, 8.85, 0], c('#7a5a2a'), [1, 1, 1], 0));
  // 水線附近的青苔
  for (let i = 0; i < 6; i++) {
    const a = rand() * Math.PI * 2;
    parts.push(sphere(0.5, [Math.cos(a) * 1.3, 3.4 + rand() * 1.2, Math.sin(a) * 1.3], MOSS, [1.2, 0.5, 1.2]));
  }
  for (const p of parts) solid.push(p.rotateZ(tilt).rotateX(-tilt * 0.4));
  return { solid: merge(solid, '半沉沒的鐘樓') };
}

/**
 * 水鏡神殿（`prop_lake_temple_core`）：湖心島上的圓形石台，外圍一圈斷柱，中央是沉睡的潮之共鳴裝置（之後的頭目戰場）。
 * 原點在石台底部；石台頂面高 0.5 m。
 */
function mirrorTemple(): ForestModel {
  const rand = mulberry32(911);
  const solid: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  solid.push(cylinder(10.5, 11, 0.3, [0, 0, 0], STONE_DARK, 28), cylinder(9.6, 9.8, 0.5, [0, 0, 0], STONE, 28));
  // 地面的同心圓紋路
  for (const r of [3.2, 6.4]) {
    const ring = new THREE.TorusGeometry(r, 0.07, 4, 40);
    ring.rotateX(Math.PI / 2);
    ring.translate(0, 0.51, 0);
    solid.push(paint(ring, c('#9aa6a8')));
  }
  // 外圍斷柱（高低不一，北側留出入口）
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 10;
    const h = 1.2 + rand() * 3.2;
    solid.push(cylinder(0.45, 0.5, h, [Math.cos(a) * 8.6, 0.5, Math.sin(a) * 8.6], i % 3 ? STONE : c('#c7ccc6'), 9));
    if (h > 3.4) solid.push(box([1.2, 0.35, 1.2], [Math.cos(a) * 8.6, 0.5 + h + 0.15, Math.sin(a) * 8.6], STONE_DARK));
  }
  // 中央：三層石座與沉睡的共鳴球（淡淡發光）
  solid.push(cylinder(1.6, 1.8, 0.5, [0, 0.5, 0], STONE_DARK, 16), cylinder(1.1, 1.3, 0.6, [0, 1.0, 0], STONE, 16));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    solid.push(box([0.25, 1.7, 0.25], [Math.cos(a) * 0.85, 1.6, Math.sin(a) * 0.85], c('#c8b27a'), [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3]));
  }
  glow.push(sphere(0.55, [0, 2.6, 0], glowColor(LAKE_BLUE, 0.9), [1, 1, 1], 2));
  for (let i = 0; i < 8; i++) {
    const a = rand() * Math.PI * 2;
    solid.push(sphere(0.6, [Math.cos(a) * (9 + rand()), 0.35, Math.sin(a) * (9 + rand())], MOSS, [1.5, 0.35, 1.1]));
  }
  return { solid: merge(solid, '水鏡神殿'), glow: merge(glow, '沉睡的共鳴') };
}

/** 湖畔燈船（Bible §7.2 地標）：一艘小木船，船頭掛著燈籠（之後伊芙的支線修好它）；原點在水面 */
function lanternBoat(): ForestModel {
  const solid: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  const hull = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  hull.scale(0.9, 0.55, 2.4);
  hull.translate(0, 0.25, 0);
  solid.push(paint(hull, WOOD));
  const rim = new THREE.TorusGeometry(1, 0.06, 5, 24);
  rim.rotateX(Math.PI / 2);
  rim.scale(0.9, 1, 2.4);
  rim.translate(0, 0.25, 0);
  solid.push(paint(rim, WOOD_DARK));
  solid.push(box([1.6, 0.08, 0.3], [0, 0.1, 0.4], WOOD_GREY), box([1.5, 0.08, 0.3], [0, 0.1, -0.8], WOOD_GREY));
  // 船頭的燈桿與燈籠
  solid.push(cylinder(0.04, 0.05, 1.8, [0, 0.2, 1.9], WOOD_DARK, 5), box([0.05, 0.05, 0.5], [0, 1.95, 2.1], WOOD_DARK));
  solid.push(box([0.32, 0.06, 0.32], [0, 1.68, 2.32], c('#5a4a32')), box([0.32, 0.06, 0.32], [0, 2.08, 2.32], c('#5a4a32')));
  glow.push(box([0.24, 0.36, 0.24], [0, 1.88, 2.32], glowColor('#ffd89a', 1.6)));
  return { solid: merge(solid, '燈船'), glow: merge(glow, '燈船的燈籠') };
}

/** 往澄鏡湖的水道入口（兩根木樁與木牌，牌下掛著小鏡片）；X 軸橫跨道路，與林道入口同尺寸 */
function lakeGate(): ForestModel {
  const solid: THREE.BufferGeometry[] = [
    cylinder(0.24, 0.3, 4.1, [-2.2, 0, 0], WOOD_GREY, 8),
    cylinder(0.24, 0.3, 4.1, [2.2, 0, 0], WOOD_GREY, 8),
    cylinder(0.16, 0.16, 5.2, [-2.6, 3.9, 0], WOOD_DARK, 8, [0, 0, -Math.PI / 2]),
    box([1.7, 0.55, 0.08], [0, 3.25, 0.05], c('#9fc3cf')),
  ];
  const glow: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    solid.push(sphere(0.32, [side * 2.2, 4.1, 0], MOSS, [1.2, 0.45, 1.1]));
    solid.push(cylinder(0.01, 0.01, 0.5, [side * 1.4, 3.4, 0], WOOD_DARK, 4));
    const disc = new THREE.CircleGeometry(0.16, 12);
    disc.translate(side * 1.4, 3.3, 0.02);
    glow.push(paint(disc, glowColor(LAKE_BLUE, 1.6)));
  }
  return { solid: merge(solid, '水道入口'), glow: merge(glow, '水道入口的鏡片') };
}

/**
 * 不自然的倒影（任務 9C，Bible §7.4 quest_lake_001）：水面上一圈不會散開的波紋，中央浮著一個發光的潮汐符號（三道波浪）。
 * seen：調查過後只剩淡淡的波紋與暗下來的符號。原點在水面（或地面）。
 */
function oddReflection(seen: boolean): ForestModel {
  const glow: THREE.BufferGeometry[] = [];
  const solid: THREE.BufferGeometry[] = [];
  const power = seen ? 0.55 : 1.6;
  for (const [r, k] of [
    [0.7, 1],
    [1.25, 0.8],
    [1.8, 0.6],
  ] as const) {
    const ring = new THREE.TorusGeometry(r, 0.035, 4, 36);
    ring.rotateX(Math.PI / 2);
    ring.translate(0, 0.04, 0);
    glow.push(paint(ring, glowColor(MIST_WHITE, power * k)));
  }
  if (!seen) {
    // 倒影裡的景象：一座小屋與燈塔的剪影（淡淡的湖藍光）
    const house = new THREE.BoxGeometry(0.5, 0.35, 0.02);
    house.translate(-0.35, 0.95, 0);
    const roof = new THREE.ConeGeometry(0.38, 0.3, 4, 1);
    roof.rotateY(Math.PI / 4);
    roof.scale(1, 1, 0.05);
    roof.translate(-0.35, 1.27, 0);
    const tower = new THREE.CylinderGeometry(0.08, 0.12, 0.9, 6);
    tower.translate(0.35, 1.2, 0);
    glow.push(paint(house, glowColor(LAKE_BLUE, 0.9)), paint(roof, glowColor(LAKE_BLUE, 0.9)), paint(tower, glowColor(LAKE_BLUE, 0.9)));
  }
  // 潮汐符號：三道波浪
  for (let k = 0; k < 3; k++) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const x = -0.32 + (i / 12) * 0.64;
      pts.push(new THREE.Vector3(x, 1.75 + k * 0.14 + Math.sin(i * 1.05) * 0.04, 0));
    }
    glow.push(paint(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.022, 4), glowColor(seen ? MIST_WHITE : '#bff0ff', seen ? 0.5 : 2)));
  }
  solid.push(sphere(0.05, [0, 0.02, 0], STONE_DARK, [1, 0.3, 1], 0));
  return { solid: merge(solid, '倒影'), glow: merge(glow, '倒影的光') };
}

/** 水鏡的底座（任務 9D）：石座、可轉動的石環、石柱；鏡面（鏡框與鏡片）由 MirrorPuzzle 另外畫，才能依轉動的方向旋轉 */
function mirrorPillarBase(): ForestModel {
  const solid: THREE.BufferGeometry[] = [cylinder(1.3, 1.5, 0.4, [0, 0, 0], STONE_DARK, 12), cylinder(0.32, 0.4, 2.9, [0, 0.4, 0], STONE, 8)];
  const ring = new THREE.TorusGeometry(1.05, 0.16, 6, 20);
  ring.rotateX(Math.PI / 2);
  ring.translate(0, 0.5, 0);
  solid.push(paint(ring, STONE));
  // 四個方向的刻痕（Bible：每座鏡片只可按 90 度旋轉）
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    solid.push(box([0.16, 0.1, 0.36], [Math.sin(a) * 1.05, 0.62, Math.cos(a) * 1.05], c('#5f6d70'), [0, a, 0]));
  }
  solid.push(sphere(0.35, [0.6, 0.45, -0.7], MOSS, [1.4, 0.4, 1]));
  return { solid: merge(solid, '水鏡底座') };
}

/** 水鏡的鏡面（MirrorPuzzle 用）：原點在石柱頂端，鏡面朝 +Z，下方一支指向鏡面方向的金色指針 */
export function mirrorHead(): ForestModel {
  const solid: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  const frame = new THREE.TorusGeometry(0.75, 0.1, 6, 24);
  frame.translate(0, 0.45, 0);
  solid.push(paint(frame, c('#c8b27a')), box([0.3, 0.25, 0.3], [0, -0.1, 0], STONE), box([0.12, 0.08, 0.7], [0, -0.05, 0.4], c('#c8b27a')));
  const back = new THREE.CircleGeometry(0.68, 24);
  back.rotateY(Math.PI);
  back.translate(0, 0.45, -0.02);
  solid.push(paint(back, STONE_DARK));
  const glass = new THREE.CircleGeometry(0.68, 24);
  glass.translate(0, 0.45, 0.02);
  glow.push(paint(glass, glowColor(LAKE_BLUE, 1.05)));
  return { solid: merge(solid, '水鏡鏡框'), glow: merge(glow, '鏡面') };
}

/** 曙光石（任務 9D 光路的光源）：北岸的一根白石柱，頂端托著一顆會發光的水晶；lit 時亮起 */
function lightPillar(lit: boolean): ForestModel {
  const solid: THREE.BufferGeometry[] = [cylinder(0.9, 1.1, 0.4, [0, 0, 0], STONE_DARK, 10), cylinder(0.35, 0.45, 3.2, [0, 0.4, 0], c('#d8dcd6'), 8)];
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    solid.push(box([0.12, 0.6, 0.12], [Math.sin(a) * 0.32, 3.8, Math.cos(a) * 0.32], c('#c8b27a'), [Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35]));
  }
  const crystal = new THREE.OctahedronGeometry(0.42, 0);
  crystal.scale(0.8, 1.3, 0.8);
  crystal.translate(0, 4.05, 0);
  const glow = [paint(crystal, lit ? glowColor('#fff4c8', 2.6) : glowColor('#9fb4bc', 0.5))];
  return { solid: merge(solid, '曙光石'), glow: merge(glow, '曙光石的水晶') };
}

/** 湖底閘門（任務 9D，`prop_lake_gate_mechanism`）：原點在湖底，石框中間一道木閘門；open 時閘門升起、框上的潮紋亮起 */
function lakeSluice(open: boolean): ForestModel {
  const solid: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) solid.push(box([0.9, 3.4, 1.2], [side * 2.1, 1.7, 0], STONE));
  solid.push(box([5.1, 0.7, 1.4], [0, 3.6, 0], STONE_DARK));
  // 木閘門：關著時落到底、打開時升到石樑下
  const lift = open ? 2.2 : 0;
  for (let k = 0; k < 5; k++) solid.push(box([3.2, 0.42, 0.2], [0, 0.3 + k * 0.44 + lift, 0], k % 2 ? WOOD : WOOD_DARK));
  // 石樑上的潮紋（三道波浪）
  for (let k = 0; k < 3; k++) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) pts.push(new THREE.Vector3(-0.6 + i * 0.12, 3.45 + k * 0.16 + Math.sin(i * 1.2) * 0.04, 0.72));
    const wave = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.025, 4);
    if (open) glow.push(paint(wave, glowColor('#bff0ff', 2)));
    else solid.push(paint(wave, c('#7f8c8f')));
  }
  return glow.length ? { solid: merge(solid, '湖底閘門'), glow: merge(glow, '閘門的潮紋') } : { solid: merge(solid, '湖底閘門') };
}

/** 神殿兩側的水鏡（任務 9E，Bible §7.5：啟動兩側水鏡令真身短暫顯形）：底座與鏡面合在一起，鏡面朝 +Z（神殿中央） */
function templeMirror(): ForestModel {
  const base = mirrorPillarBase();
  const head = mirrorHead();
  head.solid!.translate(0, 3.3, 0);
  head.glow!.translate(0, 3.3, 0);
  return { solid: merge([base.solid!, head.solid!], '神殿水鏡'), glow: head.glow! };
}

export const lakeBuilders: Record<string, () => ForestModel> = {
  temple_mirror: templeMirror,
  mirror_pillar_base: mirrorPillarBase,
  mirror_head: mirrorHead,
  light_pillar: () => lightPillar(false),
  light_pillar_lit: () => lightPillar(true),
  lake_sluice: () => lakeSluice(false),
  lake_sluice_open: () => lakeSluice(true),
  odd_reflection: () => oddReflection(false),
  odd_reflection_seen: () => oddReflection(true),
  lake_reeds: lakeReeds,
  moon_bridge: moonBridge,
  wood_dock: woodDock,
  fisher_hut: fisherHut,
  sunken_tower: sunkenTower,
  mirror_temple: mirrorTemple,
  lantern_boat: lanternBoat,
  lake_gate: lakeGate,
};
