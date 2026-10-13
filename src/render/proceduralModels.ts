import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '@/game-core/util/random';
import { BRIDGE, WATER_LEVEL } from '@/game-core/world/terrain';
import { patchMist } from './mist';
import { toonGradient } from './toon';

/**
 * 程式產生的模型（prefab model 為 `procedural:<id>`）：
 * - 可採集植物：素材包沒有花叢與草藥，以葉片面片與星形花冠組合，造型、配色與草地上的小花同一套語言；
 *   法線一律朝上（與植被相同），雙面葉片不會在背光面變黑。
 * - 木橋：素材包的橋是石拱橋，與規格的「木橋」不符，以木板、樑、柱組成。
 */

export type ModelPart = { key: string; geometry: THREE.BufferGeometry; material: THREE.Material; local: THREE.Matrix4 };

class MeshBuilder {
  readonly positions: number[] = [];
  readonly colors: number[] = [];
  readonly indices: number[] = [];

  vertex(x: number, y: number, z: number, color: THREE.Color): number {
    this.positions.push(x, y, z);
    this.colors.push(color.r, color.g, color.b);
    return this.positions.length / 3 - 1;
  }

  /** 一片從根部斜向外伸的葉子：中脈隆起成淺 V 形，根部深色、葉尖淺色 */
  leaf(o: { angle: number; length: number; width: number; tilt: number; base: THREE.Color; tip: THREE.Color; y?: number }) {
    const dx = Math.cos(o.angle);
    const dz = Math.sin(o.angle);
    const y0 = o.y ?? 0;
    // 沿葉片方向 t（0 根部 – 1 葉尖）的位置
    const along = (t: number) => {
      const d = Math.cos(o.tilt) * o.length * t;
      return [dx * d, y0 + Math.sin(o.tilt) * o.length * t, dz * d] as const;
    };
    const px = -dz * o.width;
    const pz = dx * o.width;
    const [mx, my, mz] = along(0.45);
    const [tx, ty, tz] = along(1);
    const midColor = o.base.clone().lerp(o.tip, 0.5);
    const a = this.vertex(0, y0, 0, o.base);
    const l = this.vertex(mx + px, my - 0.01, mz + pz, midColor);
    const c = this.vertex(mx, my + o.width * 0.35, mz, midColor);
    const r = this.vertex(mx - px, my - 0.01, mz - pz, midColor);
    const t = this.vertex(tx, ty, tz, o.tip);
    this.indices.push(a, l, c, a, c, r, l, t, c, c, t, r);
  }

  /** 星形花冠（petals 瓣），中心為花心色 */
  blossom(o: { x: number; y: number; z: number; radius: number; petals: number; color: THREE.Color; heart: THREE.Color }) {
    const center = this.vertex(o.x, o.y + o.radius * 0.15, o.z, o.heart);
    const rim: number[] = [];
    const n = o.petals * 2;
    for (let i = 0; i < n; i++) {
      const r = i % 2 === 0 ? o.radius : o.radius * 0.42;
      const a = (i / n) * Math.PI * 2;
      rim.push(this.vertex(o.x + Math.cos(a) * r, o.y + (i % 2 === 0 ? o.radius * 0.25 : 0), o.z + Math.sin(a) * r, o.color));
    }
    for (let i = 0; i < n; i++) this.indices.push(center, rim[i]!, rim[(i + 1) % n]!);
  }

  /** 細莖：兩片交叉的細長面片 */
  stem(x: number, z: number, height: number, color: THREE.Color) {
    for (const [sx, sz] of [
      [0.012, 0],
      [0, 0.012],
    ] as const) {
      const a = this.vertex(-sx, 0, -sz, color);
      const b = this.vertex(sx, 0, sz, color);
      const c = this.vertex(x - sx, height, z - sz, color);
      const d = this.vertex(x + sx, height, z + sz, color);
      this.indices.push(a, b, c, b, d, c);
    }
  }

  build(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    const count = this.positions.length / 3;
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({ length: count }, () => [0, 1, 0]).flat(), 3));
    geo.setIndex(this.indices);
    geo.computeBoundingSphere();
    return geo;
  }
}

const c = (hex: string) => new THREE.Color(hex);

/** 花叢：兩層圓頂狀的葉叢，上方 7 朵大花（遠大於草地上的裝飾小花，玩家一眼看出可以採） */
function flowerPatch(): THREE.BufferGeometry {
  const m = new MeshBuilder();
  const dark = c('#3f7f2c');
  const light = c('#86cc55');
  for (let i = 0; i < 10; i++) {
    m.leaf({ angle: (i / 10) * Math.PI * 2 + 0.2, length: 0.32 + (i % 3) * 0.03, width: 0.12, tilt: 0.35, base: dark, tip: light });
  }
  for (let i = 0; i < 7; i++) {
    m.leaf({ angle: (i / 7) * Math.PI * 2 + 0.6, length: 0.26, width: 0.11, tilt: 0.85, base: dark, tip: light, y: 0.04 });
  }
  const flowers = [
    { x: 0.0, z: 0.0, h: 0.46, color: '#ff8fbf' },
    { x: 0.15, z: 0.07, h: 0.36, color: '#ffffff' },
    { x: -0.13, z: 0.11, h: 0.39, color: '#ff8fbf' },
    { x: 0.05, z: -0.16, h: 0.34, color: '#ffd84a' },
    { x: -0.12, z: -0.1, h: 0.42, color: '#ffffff' },
    { x: 0.17, z: -0.08, h: 0.31, color: '#ff8fbf' },
    { x: -0.02, z: 0.18, h: 0.33, color: '#ffd84a' },
  ];
  for (const f of flowers) {
    m.stem(f.x, f.z, f.h, c('#4f8f34'));
    m.blossom({ x: f.x, y: f.h, z: f.z, radius: 0.105, petals: 6, color: c(f.color), heart: c('#ffcf33') });
  }
  return m.build();
}

/** 草藥：三層寬葉堆成的圓叢（偏藍的薄荷綠，與草地的黃綠區隔），中央抽出幾支頂著白色小花球的花莖 */
function herbBush(): THREE.BufferGeometry {
  const m = new MeshBuilder();
  const base = c('#22704a');
  const tip = c('#7fd67e');
  const layers = [
    { count: 9, length: 0.32, width: 0.15, tilt: 0.45, y: 0, offset: 0 },
    { count: 7, length: 0.32, width: 0.14, tilt: 0.95, y: 0.04, offset: 0.45 },
    { count: 5, length: 0.24, width: 0.12, tilt: 1.25, y: 0.08, offset: 0.2 },
  ];
  for (const l of layers) {
    for (let i = 0; i < l.count; i++) {
      m.leaf({ angle: (i / l.count) * Math.PI * 2 + l.offset, length: l.length, width: l.width, tilt: l.tilt, base, tip, y: l.y });
    }
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const x = Math.cos(a) * 0.1;
    const z = Math.sin(a) * 0.1;
    const h = 0.5 + (i % 2) * 0.08;
    m.stem(x, z, h, c('#3d8a3f'));
    // 小花球：三朵小花上下錯開
    for (const [dx, dy, dz] of [
      [0, 0, 0],
      [0.035, -0.03, 0.02],
      [-0.03, -0.025, -0.03],
    ] as const) {
      m.blossom({ x: x + dx, y: h + dy, z: z + dz, radius: 0.045, petals: 5, color: c('#fbfff4'), heart: c('#e6f0b8') });
    }
  }
  return m.build();
}

/**
 * 木橋（規格 5.2：損毀 / 修復兩狀態）。沿局部 +Z 方向，原點在橋面中央、橋面頂端 y = 0。
 * 木板逐片略有高低、角度與色差，像手工釘成的橋；橋柱插進水裡。
 * 損毀版：中段約 6 m 的木板與欄杆不見了，斷口的木板歪斜，兩片木板漂在水上。
 */
const BRIDGE_WIDTH = 2.6;
const PLANK = { depth: 0.34, gap: 0.05, thickness: 0.12 };
const WOOD = ['#a8723f', '#b8834c', '#966335', '#c08f58'].map((h) => new THREE.Color(h));
const WOOD_DARK = new THREE.Color('#6e4426');
/** 損毀版缺口的半長（公尺）：大於角色跳躍能跨越的距離 */
export const BRIDGE_GAP_HALF = 3;

function box(size: [number, number, number], at: [number, number, number], color: THREE.Color, rot: [number, number, number] = [0, 0, 0]): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(...size);
  g.rotateX(rot[0]);
  g.rotateY(rot[1]);
  g.rotateZ(rot[2]);
  g.translate(...at);
  const colors = new Float32Array(g.attributes.position!.count * 3);
  for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

function woodBridge(broken: boolean): THREE.BufferGeometry {
  const rand = mulberry32(broken ? 77 : 42);
  const parts: THREE.BufferGeometry[] = [];
  const half = BRIDGE.length / 2;
  const inGap = (z: number) => broken && Math.abs(z) < BRIDGE_GAP_HALF;
  const waterY = WATER_LEVEL - BRIDGE.deckY;

  // 橋面木板
  const step = PLANK.depth + PLANK.gap;
  for (let z = -half + PLANK.depth / 2; z <= half - PLANK.depth / 2 + 1e-6; z += step) {
    const nearGap = broken && Math.abs(Math.abs(z) - BRIDGE_GAP_HALF) < 0.6;
    if (inGap(z)) continue;
    // 斷口邊緣的木板歪斜下垂
    const sag = nearGap ? -0.08 - rand() * 0.1 : (rand() - 0.5) * 0.02;
    const tilt: [number, number, number] = nearGap ? [(rand() - 0.5) * 0.35, (rand() - 0.5) * 0.2, (rand() - 0.5) * 0.25] : [0, (rand() - 0.5) * 0.04, 0];
    parts.push(box([BRIDGE_WIDTH + (rand() - 0.5) * 0.12, PLANK.thickness, PLANK.depth], [0, -PLANK.thickness / 2 + sag, z], WOOD[Math.floor(rand() * WOOD.length)]!, tilt));
  }
  // 兩根縱樑
  for (const x of [-0.95, 0.95]) {
    if (broken) {
      for (const sign of [-1, 1]) {
        const len = half - BRIDGE_GAP_HALF + 0.4;
        parts.push(box([0.22, 0.26, len], [x, -0.25, sign * (half - len / 2)], WOOD_DARK));
      }
    } else {
      parts.push(box([0.22, 0.26, BRIDGE.length], [x, -0.25, 0], WOOD_DARK));
    }
  }
  // 橋柱（插進水裡）與欄杆
  const postZ = [-half + 0.3, -half / 2, 0, half / 2, half - 0.3];
  for (const z of postZ) {
    if (inGap(z)) continue;
    for (const x of [-1.25, 1.25]) {
      const bottom = waterY - 2.5;
      parts.push(box([0.24, 0.95 - bottom, 0.24], [x, (0.95 + bottom) / 2, z], WOOD_DARK, [0, rand() * 0.3, 0]));
    }
  }
  for (const x of [-1.25, 1.25]) {
    if (broken) {
      for (const sign of [-1, 1]) {
        const len = half - BRIDGE_GAP_HALF + 0.2;
        parts.push(box([0.12, 0.12, len], [x, 0.82, sign * (half - len / 2)], WOOD[2]!));
        // 斷掉的欄杆末端往下垂
        parts.push(box([0.11, 0.11, 0.9], [x, 0.62, sign * (BRIDGE_GAP_HALF + 0.1)], WOOD[2]!, [sign * 0.55, 0, 0]));
      }
    } else {
      parts.push(box([0.12, 0.12, BRIDGE.length - 0.4], [x, 0.82, 0], WOOD[2]!));
      parts.push(box([0.08, 0.08, BRIDGE.length - 0.4], [x, 0.45, 0], WOOD[0]!));
    }
  }
  // 漂在水上的木板
  if (broken) {
    parts.push(box([BRIDGE_WIDTH * 0.9, PLANK.thickness, PLANK.depth], [0.8, waterY + 0.03, 1.2], WOOD[1]!, [0, 0.7, 0]));
    parts.push(box([BRIDGE_WIDTH * 0.7, PLANK.thickness, PLANK.depth], [-1.4, waterY + 0.03, -0.8], WOOD[3]!, [0, -0.4, 0]));
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  if (!merged) throw new Error('木橋幾何合併失敗');
  merged.computeBoundingSphere();
  return merged;
}

/** 營火：一圈石頭、交叉的木柴、三層火焰（火焰顏色很亮，交給 Bloom 發光；跳動由 CampfireFlames 另外處理） */
function campfire(): THREE.BufferGeometry {
  const rand = mulberry32(5);
  const parts: THREE.BufferGeometry[] = [];
  const stone = ['#8f8d84', '#a3a197', '#7d7b73'].map((h) => new THREE.Color(h));
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const g = new THREE.IcosahedronGeometry(0.13 + rand() * 0.04, 0);
    g.scale(1.2, 0.75, 1);
    g.rotateY(a);
    g.translate(Math.cos(a) * 0.46, 0.07, Math.sin(a) * 0.46);
    const colors = new Float32Array(g.attributes.position!.count * 3);
    const col = stone[i % stone.length]!;
    for (let k = 0; k < colors.length; k += 3) col.toArray(colors, k);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    parts.push(g);
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    parts.push(box([0.11, 0.11, 0.7], [0, 0.1 + i * 0.03, 0], WOOD_DARK, [0.25, a, 0]));
  }
  const flame = (r: number, h: number, y: number, color: string) => {
    const g = new THREE.ConeGeometry(r, h, 7);
    g.translate(0, y + h / 2, 0);
    const colors = new Float32Array(g.attributes.position!.count * 3);
    const bright = new THREE.Color(color).multiplyScalar(1.6);
    for (let k = 0; k < colors.length; k += 3) bright.toArray(colors, k);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  };
  parts.push(flame(0.2, 0.42, 0.12, '#ff7a1a'), flame(0.13, 0.36, 0.14, '#ffb22e'), flame(0.07, 0.24, 0.16, '#fff1a1'));
  // 石頭（多面體）沒有索引、木柴與火焰有索引：統一轉成無索引才能合併
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  const merged = mergeGeometries(flat);
  new Set([...parts, ...flat]).forEach((p) => p.dispose());
  if (!merged) throw new Error('營火幾何合併失敗');
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

/** 合併有 / 無索引混雜的部件 */
function mergeParts(parts: THREE.BufferGeometry[], name: string): THREE.BufferGeometry {
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  const merged = mergeGeometries(flat);
  new Set([...parts, ...flat]).forEach((p) => p.dispose());
  if (!merged) throw new Error(`${name}幾何合併失敗`);
  merged.computeBoundingSphere();
  return merged;
}

/** 酒館室內（可進入建築的子場景）：木地板、下半木牆上半灰泥、木柱、天花板橫樑、窗、石砌壁爐、關著的門。原點在地板中央 */
export const TAVERN_ROOM = { width: 12, depth: 9, height: 4.2 } as const;
function tavernRoom(): THREE.BufferGeometry {
  const { width: W, depth: D, height: H } = TAVERN_ROOM;
  const rand = mulberry32(9);
  const parts: THREE.BufferGeometry[] = [];
  const plaster = new THREE.Color('#efe2c4');
  const plasterDark = new THREE.Color('#e2d0aa');
  const wood = WOOD;
  // 地板：沿 X 的木板，下面墊一層深色底板（木板縫不透出背景）
  parts.push(box([W, 0.05, D], [0, -0.125, 0], WOOD_DARK));
  for (let z = -D / 2 + 0.22; z < D / 2; z += 0.45) {
    parts.push(box([W, 0.1, 0.42], [0, -0.05 + (rand() - 0.5) * 0.008, z], wood[Math.floor(rand() * wood.length)]!.clone().multiplyScalar(0.85)));
  }
  // 牆：灰泥牆面 + 下半木護牆
  const wall = (size: [number, number, number], at: [number, number, number], panel: [number, number, number], panelAt: [number, number, number]) => {
    parts.push(box(size, at, plaster));
    parts.push(box(panel, panelAt, wood[2]!));
  };
  wall([W, H, 0.3], [0, H / 2, -D / 2 - 0.15], [W, 1.2, 0.06], [0, 0.6, -D / 2 + 0.03]);
  wall([0.3, H, D], [-W / 2 - 0.15, H / 2, 0], [0.06, 1.2, D], [-W / 2 + 0.03, 0.6, 0]);
  wall([0.3, H, D], [W / 2 + 0.15, H / 2, 0], [0.06, 1.2, D], [W / 2 - 0.03, 0.6, 0]);
  const side = W / 2 - 0.8;
  for (const sign of [-1, 1]) wall([side, H, 0.3], [sign * (W / 4 + 0.4), H / 2, D / 2 + 0.15], [side, 1.2, 0.06], [sign * (W / 4 + 0.4), 0.6, D / 2 - 0.03]);
  parts.push(box([1.6, H - 2.4, 0.3], [0, 2.4 + (H - 2.4) / 2, D / 2 + 0.15], plaster));
  // 門（關著）與門框
  parts.push(box([1.5, 2.4, 0.12], [0, 1.2, D / 2 + 0.2], wood[0]!));
  for (const x of [-0.8, 0.8]) parts.push(box([0.16, 2.5, 0.36], [x, 1.25, D / 2 + 0.05], WOOD_DARK));
  parts.push(box([1.8, 0.18, 0.36], [0, 2.5, D / 2 + 0.05], WOOD_DARK));
  parts.push(box([0.1, 0.1, 0.06], [0.55, 1.15, D / 2 + 0.12], new THREE.Color('#d9b45b')));
  // 木柱
  for (const x of [-W / 2, -W / 4, 0, W / 4, W / 2]) parts.push(box([0.3, H, 0.3], [x * 0.98, H / 2, -D / 2 + 0.05], WOOD_DARK));
  for (const z of [-D / 4, D / 4]) for (const x of [-W / 2 + 0.05, W / 2 - 0.05]) parts.push(box([0.3, H, 0.3], [x, H / 2, z], WOOD_DARK));
  // 天花板與橫樑
  parts.push(box([W + 0.6, 0.2, D + 0.6], [0, H + 0.1, 0], plasterDark));
  for (let z = -D / 2 + 1; z < D / 2; z += 2.2) parts.push(box([W, 0.28, 0.32], [0, H - 0.14, z], WOOD_DARK));
  // 窗：左牆兩扇發亮的窗（天色）
  for (const z of [-2, 2]) {
    parts.push(box([0.06, 1.1, 1.3], [-W / 2 + 0.04, 2.1, z], new THREE.Color(1.6, 1.85, 2.0)));
    parts.push(box([0.1, 0.12, 1.5], [-W / 2 + 0.06, 1.5, z], WOOD_DARK));
    parts.push(box([0.1, 0.12, 1.5], [-W / 2 + 0.06, 2.7, z], WOOD_DARK));
    parts.push(box([0.1, 1.2, 0.1], [-W / 2 + 0.06, 2.1, z], WOOD_DARK));
  }
  // 石砌壁爐（營火放在它前面）
  const stone = [new THREE.Color('#9d9a90'), new THREE.Color('#8a877e'), new THREE.Color('#b0ada3')];
  for (let y = 0.2; y < H; y += 0.42) {
    for (let x = 3.9; x <= 5.9; x += 0.52) {
      parts.push(box([0.5, 0.4, 0.55], [x + ((Math.round(y / 0.42) % 2) * 0.26 - 0.13), y, -D / 2 + 0.3], stone[Math.floor(rand() * 3)]!));
    }
  }
  parts.push(box([2.6, 0.16, 0.7], [4.9, 1.9, -D / 2 + 0.45], WOOD_DARK));
  return mergeParts(parts, '酒館室內');
}

/** 出口的門墊 */
function doorMat(): THREE.BufferGeometry {
  const parts = [box([1.3, 0.03, 0.75], [0, 0.015, 0], new THREE.Color('#b0473a')), box([1.1, 0.032, 0.12], [0, 0.017, 0], new THREE.Color('#e8c46a'))];
  return mergeParts(parts, '門墊');
}

type Builder = { build: () => THREE.BufferGeometry; kind: 'plant' | 'solid' };

const builders: Record<string, Builder> = {
  flower_patch: { build: flowerPatch, kind: 'plant' },
  herb_bush: { build: herbBush, kind: 'plant' },
  wood_bridge: { build: () => woodBridge(false), kind: 'solid' },
  wood_bridge_broken: { build: () => woodBridge(true), kind: 'solid' },
  campfire: { build: campfire, kind: 'solid' },
  tavern_room: { build: tavernRoom, kind: 'solid' },
  door_mat: { build: doorMat, kind: 'solid' },
};

export const PROCEDURAL_PREFIX = 'procedural:';

/** 建立程式模型的部件。回傳的 geometry 與 material 由呼叫端負責釋放。 */
export function buildProceduralModel(model: string): ModelPart[] {
  const id = model.slice(PROCEDURAL_PREFIX.length);
  const builder = builders[id];
  if (!builder) throw new Error(`未知的程式模型：${model}`);
  if (builder.kind === 'solid') {
    // 實心物件（木橋）：一般 toon 材質，使用幾何本身的法線
    const material = patchMist(new THREE.MeshToonMaterial({ gradientMap: toonGradient(), vertexColors: true }));
    material.name = `procedural_${id}`;
    return [{ key: id, geometry: builder.build(), material, local: new THREE.Matrix4() }];
  }
  const material = new THREE.MeshToonMaterial({ gradientMap: toonGradient(), vertexColors: true, side: THREE.DoubleSide });
  // 雙面材質在背面會把法線翻成朝下而變暗（花瓣發灰）；與植被相同，一律使用朝上的頂點法線
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\nnormal = normalize(vNormal);',
    );
  };
  material.customProgramCacheKey = () => 'procedural-plant';
  material.name = `procedural_${id}`;
  patchMist(material);
  return [{ key: id, geometry: builder.build(), material, local: new THREE.Matrix4() }];
}
