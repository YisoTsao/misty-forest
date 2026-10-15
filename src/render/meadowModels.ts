import * as THREE from 'three';
import { mulberry32 } from '@/game-core/util/random';
import { cylinder, glowColor, leaf, merge, paint, sphere, type ForestModel } from './forestModels';

/**
 * 風語草原的程式模型（任務 9F，Bible §8.3、§8.7）：風訊號旗、風向塔、風帆平台、彎月石拱、受風傾斜的樹、浮石、古風帆。
 * 配色依 Bible：嫩草綠、金黃、天空藍、花朵珊瑚色；木頭是曬過太陽的淺棕。
 */
const c = (hex: string) => new THREE.Color(hex);
const WOOD = c('#b0835a');
const WOOD_DARK = c('#7f5a3c');
const STONE = c('#cfc6b4');
const STONE_DARK = c('#a39a88');
const CLOTH = c('#f4ead2');
const CORAL = c('#f08a6c');
const GOLD = c('#e8c25a');
const SKY = c('#6fb6e8');
const LEAF = c('#7fbf5a');
const LEAF_LIGHT = c('#b8dc78');

function box(size: [number, number, number], at: [number, number, number], color: THREE.Color, rot: [number, number, number] = [0, 0, 0]): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(...size);
  g.rotateX(rot[0]);
  g.rotateY(rot[1]);
  g.rotateZ(rot[2]);
  g.translate(...at);
  return paint(g, color);
}

/** 一面飄動的布（細分的平面，沿 +X 由旗桿往外波動）；原點在旗桿上的掛點 */
function banner(width: number, height: number, color: THREE.Color, wave: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(width, height, 8, 3);
  g.translate(width / 2, -height / 2, 0);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setZ(i, Math.sin(x * 2.4 + seed) * wave * (x / width));
  }
  g.computeVertexNormals();
  return paint(g, color);
}

/** 風訊號旗（`prop_meadow_wind_flag`）：高木桿上一面三角形長旗與一顆風鈴；fallen 時倒在地上（之後的任務把它立回去） */
function windFlag(color: THREE.Color, fallen: boolean): ForestModel {
  const parts = [cylinder(0.08, 0.1, 4.2, [0, 0, 0], WOOD_DARK, 7), sphere(0.14, [0, 4.25, 0], GOLD, [1, 1, 1], 1), banner(1.8, 0.9, color, 0.25, 1), banner(1.4, 0.35, CLOTH, 0.15, 2.2)];
  parts[2]!.translate(0.08, 4.0, 0);
  parts[3]!.translate(0.08, 2.95, 0);
  const solid = [parts[0]!, parts[1]!, cylinder(0.3, 0.38, 0.25, [0, 0, 0], STONE_DARK, 8)];
  const plant = [parts[2]!, parts[3]!];
  if (fallen) {
    for (const g of [...solid.slice(0, 2), ...plant]) {
      g.rotateZ(-Math.PI / 2 + 0.12);
      g.translate(0, 0.25, 0);
    }
  }
  return { solid: merge(solid, '風訊號旗'), plant: merge(plant, '旗面') };
}

/** 風向塔（`prop_meadow_wind_tower`，主地標）：石砌塔身、木造上層、頂端停住的大風向標與三片葉輪（之後重啟） */
function windTower(): ForestModel {
  const solid: THREE.BufferGeometry[] = [cylinder(3.2, 3.8, 0.8, [0, 0, 0], STONE_DARK, 12), cylinder(2.4, 3, 9, [0, 0.8, 0], STONE, 12), cylinder(2.7, 2.7, 0.5, [0, 9.8, 0], STONE_DARK, 12)];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    solid.push(box([0.3, 4, 0.3], [Math.cos(a) * 2.2, 12.3, Math.sin(a) * 2.2], WOOD));
  }
  const roof = new THREE.ConeGeometry(3.2, 3, 8);
  roof.translate(0, 15.8, 0);
  solid.push(paint(roof, c('#4f8fbf')));
  // 門與窗
  solid.push(box([1.4, 2.4, 0.3], [0, 2.0, 2.75], WOOD_DARK), box([0.8, 1, 0.3], [0, 6, 2.45], c('#3f6a88')));
  // 頂端的風向標（停住）與三片葉輪
  solid.push(cylinder(0.08, 0.08, 2.4, [0, 17, 0], WOOD_DARK, 6), box([2.6, 0.12, 0.12], [0.4, 18.6, 0], WOOD_DARK));
  const fin = new THREE.BufferGeometry();
  fin.setAttribute('position', new THREE.Float32BufferAttribute([1.7, 18.6, 0, 1.2, 19.2, 0, 1.2, 18.0, 0], 3));
  fin.computeVertexNormals();
  solid.push(paint(fin, GOLD));
  const plant: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const blade = banner(2.6, 0.9, k === 0 ? CORAL : k === 1 ? GOLD : SKY, 0.1, k);
    blade.rotateZ((k / 3) * Math.PI * 2);
    blade.translate(0, 11.5, 2.75);
    plant.push(blade);
  }
  solid.push(sphere(0.35, [0, 11.5, 2.75], WOOD_DARK, [1, 1, 0.6], 1));
  return { solid: merge(solid, '風向塔'), plant: merge(plant, '風向塔的葉輪') };
}

/** 風帆平台（`prop_meadow_windsail_platform`）：木平台、桅杆與一面收起來的帆 */
function windsailPlatform(): ForestModel {
  const solid: THREE.BufferGeometry[] = [box([6, 0.3, 6], [0, 0.9, 0], WOOD)];
  for (const x of [-2.7, 2.7]) for (const z of [-2.7, 2.7]) solid.push(cylinder(0.18, 0.2, 0.9, [x, 0, z], WOOD_DARK, 6));
  // 西側的四階木梯：越靠近平台越高（與 prefab 的碰撞一致，每階 0.25 m）
  for (let i = 0; i < 4; i++) solid.push(box([0.6, 0.25 * (i + 1), 1.2], [-5.1 + i * 0.6, 0.125 * (i + 1), 0], WOOD_DARK));
  solid.push(cylinder(0.14, 0.16, 6.5, [1.8, 1.05, -1.8], WOOD_DARK, 7), box([3.2, 0.12, 0.12], [1.8, 6.4, -1.8], WOOD_DARK, [0, Math.PI / 4, 0]));
  const sail = banner(2.6, 3.4, CLOTH, 0.35, 0.5);
  sail.rotateY(-Math.PI / 4);
  sail.translate(0.85, 6.3, -0.85);
  return { solid: merge(solid, '風帆平台'), plant: merge([sail], '帆') };
}

/** 彎月石拱（地標）：一道彎成新月形的天然石拱，兩腳長著草 */
function crescentArch(): ForestModel {
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-4, 0, 0), new THREE.Vector3(-4.2, 3.5, 0.3), new THREE.Vector3(-2.2, 6.4, 0), new THREE.Vector3(1.2, 7, -0.2), new THREE.Vector3(3.6, 5.2, 0), new THREE.Vector3(4.4, 2.2, 0.3), new THREE.Vector3(4.6, 0, 0)]);
  const arch = new THREE.TubeGeometry(curve, 30, 0.9, 8, false);
  const pos = arch.attributes.position as THREE.BufferAttribute;
  // 新月：中間粗、兩端細
  for (let i = 0; i < pos.count; i++) {
    const ring = Math.floor(i / 9);
    const t = ring / 30;
    const center = curve.getPointAt(Math.min(1, t));
    const k = 0.45 + 0.75 * Math.sin(t * Math.PI);
    pos.setXYZ(i, center.x + (pos.getX(i) - center.x) * k, center.y + (pos.getY(i) - center.y) * k, center.z + (pos.getZ(i) - center.z) * k);
  }
  arch.computeVertexNormals();
  const solid = [paint(arch, STONE), sphere(1.3, [-4, 0.2, 0], STONE_DARK, [1.1, 0.5, 1.1], 1), sphere(1, [4.6, 0.2, 0], STONE_DARK, [1.1, 0.5, 1.1], 1)];
  const rand = mulberry32(951);
  const plant: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 18; i++) {
    const a = rand() * Math.PI * 2;
    const x = (i < 9 ? -4 : 4.6) + Math.cos(a) * 1.2;
    plant.push(leaf(a, 0.5 + rand() * 0.4, 0.06, 1.1, LEAF, LEAF_LIGHT).translate(x, 0.1, Math.sin(a) * 1.2));
  }
  return { solid: merge(solid, '彎月石拱'), plant: merge(plant, '石拱的草') };
}

/** 受風傾斜的樹（`tree_meadow_windbent`）：彎向東方的樹幹，樹冠被風吹成一邊長 */
function windbentTree(): ForestModel {
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.4, 1.6, 0), new THREE.Vector3(1.4, 3, 0.1), new THREE.Vector3(2.6, 3.9, 0)]);
  const trunk = new THREE.TubeGeometry(curve, 12, 0.28, 7, false);
  const solid = [paint(trunk, WOOD_DARK)];
  const crowns = [sphere(1.4, [2.6, 4.3, 0], LEAF, [1.5, 0.75, 1.1], 1), sphere(1.1, [1.4, 4.0, 0.3], c('#6aa84c'), [1.2, 0.7, 1], 1), sphere(0.9, [3.8, 4.1, -0.2], LEAF_LIGHT, [1.3, 0.6, 1], 1)];
  return { solid: merge([...solid, ...crowns], '受風傾斜的樹') };
}

/** 浮石（`ruin_meadow_floatstone`）：浮在半空的圓潤石塊，底下有一圈淡淡的風紋光 */
function floatStone(): ForestModel {
  const rand = mulberry32(952);
  const rock = new THREE.DodecahedronGeometry(1, 1);
  const pos = rock.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) * (pos.getY(i) < 0 ? 0.55 : 0.8));
  rock.computeVertexNormals();
  rock.translate(0, 2.4, 0);
  const solid = [paint(rock, STONE, 0.05, rand), sphere(0.5, [0.2, 3.1, 0.3], LEAF, [1.4, 0.35, 1.1], 1)];
  const ring = new THREE.TorusGeometry(0.9, 0.03, 4, 28);
  ring.rotateX(Math.PI / 2);
  ring.translate(0, 1.2, 0);
  return { solid: merge(solid, '浮石'), glow: merge([paint(ring, glowColor('#e8fbff', 1.2))], '風紋') };
}

/** 古風帆（任務 9F，Bible §3：古風帆啟動→風語草原）：兩根高桅與一面橫跨道路的大帆，X 軸橫跨道路，與林道入口同尺寸 */
function sailGate(): ForestModel {
  const solid: THREE.BufferGeometry[] = [cylinder(0.24, 0.3, 6, [-2.4, 0, 0], WOOD_DARK, 8), cylinder(0.24, 0.3, 6, [2.4, 0, 0], WOOD_DARK, 8), box([5.6, 0.18, 0.18], [0, 5.6, 0], WOOD)];
  solid.push(box([1.6, 0.5, 0.08], [0, 2.9, 0.12], c('#e8d6a0')));
  const sail = banner(4.4, 2.2, CLOTH, 0.3, 0.8);
  sail.translate(-2.2, 5.5, 0);
  const stripe = banner(4.4, 0.4, CORAL, 0.3, 0.8);
  stripe.translate(-2.2, 4.4, 0.01);
  const glow: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) glow.push(sphere(0.18, [side * 2.4, 6.15, 0], glowColor('#fff2c0', 1.8), [1, 1, 1], 1));
  return { solid: merge(solid, '古風帆'), plant: merge([sail, stripe], '帆布'), glow: merge(glow, '桅燈') };
}

/** 風之巨偶競技場的外圈（`prop_meadow_golem_arena`）：一圈低矮的石墩（之後的頭目戰場） */
function arenaRing(): ForestModel {
  const solid: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 16; i++) {
    // 南側（+Z，i = 4）留一個缺口當入口：草原小徑從這裡走進來
    if (i === 4) continue;
    const a = (i / 16) * Math.PI * 2;
    solid.push(box([1.4, 0.7 + (i % 3) * 0.25, 1], [Math.cos(a) * 19, 0.3, Math.sin(a) * 19], STONE, [0, -a, 0]));
  }
  const ring = new THREE.TorusGeometry(12, 0.12, 4, 64);
  ring.rotateX(Math.PI / 2);
  ring.translate(0, 0.05, 0);
  solid.push(paint(ring, STONE_DARK));
  return { solid: merge(solid, '競技場外圈') };
}

export const meadowBuilders: Record<string, () => ForestModel> = {
  wind_flag_coral: () => windFlag(CORAL, false),
  wind_flag_gold: () => windFlag(GOLD, false),
  wind_flag_sky: () => windFlag(SKY, false),
  wind_flag_coral_fallen: () => windFlag(CORAL, true),
  wind_flag_gold_fallen: () => windFlag(GOLD, true),
  wind_flag_sky_fallen: () => windFlag(SKY, true),
  wind_tower: windTower,
  windsail_platform: windsailPlatform,
  crescent_arch: crescentArch,
  windbent_tree: windbentTree,
  float_stone: floatStone,
  sail_gate: sailGate,
  arena_ring: arenaRing,
};
