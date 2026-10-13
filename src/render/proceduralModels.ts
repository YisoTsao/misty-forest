import * as THREE from 'three';
import { patchMist } from './mist';
import { toonGradient } from './toon';

/**
 * 程式產生的小型可採集植物（prefab model 為 `procedural:<id>`）。
 * 素材包沒有花叢與草藥，因此以葉片面片與星形花冠組合，造型、配色與草地上的小花同一套語言；
 * 法線一律朝上（與植被相同），雙面葉片不會在背光面變黑。
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

const builders: Record<string, () => THREE.BufferGeometry> = {
  flower_patch: flowerPatch,
  herb_bush: herbBush,
};

export const PROCEDURAL_PREFIX = 'procedural:';

/** 建立程式模型的部件。回傳的 geometry 與 material 由呼叫端負責釋放。 */
export function buildProceduralModel(model: string): ModelPart[] {
  const id = model.slice(PROCEDURAL_PREFIX.length);
  const build = builders[id];
  if (!build) throw new Error(`未知的程式模型：${model}`);
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
  return [{ key: id, geometry: build(), material, local: new THREE.Matrix4() }];
}
