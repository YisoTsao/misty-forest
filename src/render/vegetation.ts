import * as THREE from 'three';
import { patchMist } from './mist';
import { GRASS_UNIFORMS_GLSL, grassUniforms, TERRAIN_COLOR_GLSL } from './terrainMaterial';
import { toonGradient } from './toon';

/**
 * 草叢與花朵（規格 4.3：instanced 面片 + 風動 vertex shader，根部固定，依距離淡出）。
 * - 風動：位移量隨高度平方增加，根部（y = 0）不動。
 * - 距離淡出：超過 uFadeStart 後整株縮入地面，不需要半透明排序。
 * - 法線全部朝上：與地面受光一致，草叢不會在背光面變成黑色剪影。
 */

/** 所有植被材質共用的時間與風力 uniform（由 GrassField 每幀更新一次） */
export const vegetationUniforms = {
  uTime: { value: 0 },
  uWind: { value: 0.09 },
  uFadeStart: { value: 40 },
  uFadeEnd: { value: 55 },
};

const WIND_VERTEX = /* glsl */ `
  #ifdef USE_INSTANCING
    vec3 vegOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #else
    vec3 vegOrigin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #endif
  float vegTip = clamp(position.y / uVegHeight, 0.0, 1.0);
  float vegPhase = vegOrigin.x * 0.35 + vegOrigin.z * 0.27;
  // 大範圍陣風（緩慢移動的波）乘上個別擺動
  float vegGust = 0.55 + 0.45 * sin(uTime * 0.8 - vegOrigin.x * 0.06 - vegOrigin.z * 0.04);
  vec2 vegSway = vec2(sin(uTime * 1.9 + vegPhase), cos(uTime * 1.5 + vegPhase * 1.3) * 0.6) * uWind * vegGust;
  transformed.xz += vegSway * vegTip * vegTip * uVegHeight;
  float vegFade = 1.0 - smoothstep(uFadeStart, uFadeEnd, distance(vegOrigin.xz, cameraPosition.xz));
  transformed *= vegFade;
  vVegTip = vegTip;
`;

const COMMON_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uWind;
  uniform float uFadeStart;
  uniform float uFadeEnd;
  uniform float uVegHeight;
  varying float vVegTip;
`;

type VegetationKind = 'grass' | 'flower';

function createVegetationMaterial(kind: VegetationKind, height: number): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ gradientMap: toonGradient(), side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, vegetationUniforms, grassUniforms, { uVegHeight: { value: height } });
    const isGrass = kind === 'grass';
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        ${COMMON_VERTEX}
        ${isGrass ? `${GRASS_UNIFORMS_GLSL}\n${TERRAIN_COLOR_GLSL}\nvarying vec3 vVegColor;` : 'attribute vec3 aColor;\nattribute float aPetal;\nattribute vec3 aFlowerColor;\nvarying vec3 vVegColor;'}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        ${WIND_VERTEX}
        ${
          isGrass
            ? // 草：根部取地面顏色並壓暗，葉尖提亮
              'vec3 vegBase = grassColorAt(vegOrigin.xz);\nvVegColor = mix(vegBase * 0.8, vegBase * 1.1 + vec3(0.02, 0.05, 0.0), vegTip);'
            : // 花：莖與花心用頂點色，花瓣用每株的花色
              'vVegColor = mix(aColor, aFlowerColor, aPetal);'
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vVegTip;\nvarying vec3 vVegColor;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vVegColor;')
      // 雙面材質在背面會把法線翻成朝下而變暗；植被一律用朝上的法線，與地面受光一致
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
  };
  material.customProgramCacheKey = () => `vegetation-${kind}`;
  return patchMist(material);
}

/** 一叢草：數片以根部為中心、向外微傾的錐形葉片 */
export function createGrassTuftGeometry(): THREE.BufferGeometry {
  const blades = 5;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let b = 0; b < blades; b++) {
    const angle = (b / blades) * Math.PI * 2 + (b % 2) * 0.4;
    const lean = 0.07 + (b % 3) * 0.04;
    const height = 0.2 + ((b * 37) % 5) * 0.025;
    const width = 0.075;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    // 葉片面與傾倒方向垂直
    const px = -dz * width;
    const pz = dx * width;
    const ox = dx * 0.04;
    const oz = dz * 0.04;
    const base = positions.length / 3;
    positions.push(
      ox - px, 0, oz - pz,
      ox + px, 0, oz + pz,
      ox + dx * lean * 0.5 - px * 0.6, height * 0.55, oz + dz * lean * 0.5 - pz * 0.6,
      ox + dx * lean * 0.5 + px * 0.6, height * 0.55, oz + dz * lean * 0.5 + pz * 0.6,
      ox + dx * lean, height, oz + dz * lean,
    );
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(upNormals(positions.length / 3), 3));
  geo.setIndex(indices);
  return geo;
}

/** 一朵小花：細莖 + 五瓣星形花冠 + 花心。aPetal = 1 的頂點會換成每株的花色。 */
export function createFlowerGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const petal: number[] = [];
  const indices: number[] = [];
  const stem = new THREE.Color('#4f8f34');
  const heart = new THREE.Color('#ffd23f');
  const white = new THREE.Color('#ffffff');
  const push = (x: number, y: number, z: number, c: THREE.Color, isPetal: number) => {
    positions.push(x, y, z);
    colors.push(c.r, c.g, c.b);
    petal.push(isPetal);
    return positions.length / 3 - 1;
  };
  const h = 0.26;
  // 莖：兩片交叉的細長面片
  for (const [sx, sz] of [
    [0.012, 0],
    [0, 0.012],
  ] as const) {
    const a = push(-sx, 0, -sz, stem, 0);
    const b = push(sx, 0, sz, stem, 0);
    const c = push(-sx, h, -sz, stem, 0);
    const d = push(sx, h, sz, stem, 0);
    indices.push(a, b, c, b, d, c);
  }
  // 花冠：略微朝上傾的星形
  const center = push(0, h + 0.012, 0, white, 1);
  const rim: number[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.085 : 0.04;
    const a = (i / 10) * Math.PI * 2;
    rim.push(push(Math.cos(a) * r, h + (i % 2 === 0 ? 0.02 : 0), Math.sin(a) * r, white, 1));
  }
  for (let i = 0; i < 10; i++) indices.push(center, rim[i]!, rim[(i + 1) % 10]!);
  // 花心
  const hc = push(0, h + 0.02, 0, heart, 0);
  const hr: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    hr.push(push(Math.cos(a) * 0.025, h + 0.018, Math.sin(a) * 0.025, heart, 0));
  }
  for (let i = 0; i < 6; i++) indices.push(hc, hr[i]!, hr[(i + 1) % 6]!);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(upNormals(positions.length / 3), 3));
  geo.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('aPetal', new THREE.Float32BufferAttribute(petal, 1));
  geo.setIndex(indices);
  return geo;
}

function upNormals(count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(0, 1, 0);
  return out;
}

/** 花色（白、黃、粉、淡紫、天藍），與規格 4.1 的明亮飽和色調一致 */
export const flowerColors = ['#ffffff', '#ffe066', '#ff9ec7', '#c9a2ff', '#8fd3ff'] as const;

export const GRASS_HEIGHT = 0.32;
export const FLOWER_HEIGHT = 0.3;

export function createGrassMaterial(): THREE.MeshToonMaterial {
  return createVegetationMaterial('grass', GRASS_HEIGHT);
}

export function createFlowerMaterial(): THREE.MeshToonMaterial {
  return createVegetationMaterial('flower', FLOWER_HEIGHT);
}
