import * as THREE from 'three';
import { CHANNEL_WATER_LEVEL, TRAIL_HALF_WIDTH } from '@/game-core/world/glowmossTerrain';
import { MEADOW_TRAIL_HALF_WIDTH } from '@/game-core/world/meadowTerrain';
import { MIRRORLAKE_TRAIL_HALF_WIDTH } from '@/game-core/world/mirrorlakeTerrain';
import type { MapId } from '@/game-core/world/maps';
import { PATH_HALF_WIDTH, WATER_LEVEL } from '@/game-core/world/terrain';
import { patchMist } from './mist';
import { palette } from './palette';
import { toonGradient } from './toon';

/**
 * 地形材質（規格 4.2：splat 混合草地、泥土路、岩石，手繪低對比）。
 * 不使用貼圖：權重由頂點屬性（到小路的距離）與世界座標雜訊在 shader 內計算，
 * 因此任何解析度下都沒有貼圖拉伸，也不需要額外載入資產。
 * 色塊以低頻雜訊做出「筆刷感」的大片深淺變化，再疊一層細小斑點避免單調。
 */

/** 雜訊與草地顏色函式：地形與草叢共用，讓草葉根部顏色與底下地面一致。需要 uGrass* uniform。 */
export const TERRAIN_COLOR_GLSL = /* glsl */ `
  float tHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float tNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), u.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float tFbm(vec2 p) {
    return tNoise(p) * 0.6 + tNoise(p * 2.13 + 7.1) * 0.28 + tNoise(p * 4.37 + 3.7) * 0.12;
  }
  // 草地：大片深淺（筆刷色塊）＋ 向陽的黃綠斑塊
  vec3 grassColorAt(vec2 wp) {
    float broad = tFbm(wp * 0.045);
    vec3 grass = mix(uGrassDark, uGrassLight, smoothstep(0.25, 0.75, broad));
    float sunny = smoothstep(0.58, 0.72, tFbm(wp * 0.09 + 17.0));
    return mix(grass, uGrassSun, sunny * 0.55);
  }
`;

export const GRASS_UNIFORMS_GLSL = /* glsl */ `
  uniform vec3 uGrassLight;
  uniform vec3 uGrassDark;
  uniform vec3 uGrassSun;
`;

/** 各地圖的地面色票（任務 8A：螢苔祕林是深林綠的苔地、深色林土與乾涸的渠道泥面） */
type GroundPalette = {
  grassLight: string;
  grassDark: string;
  grassSun: string;
  dirt: string;
  dirtDark: string;
  rock: string;
  /** 水邊（晨曦谷地為沙岸；螢苔祕林為乾涸渠道的泥面） */
  sand: string;
  lakeBed: string;
  waterLevel: number;
  pathHalf: number;
};

const GROUND: Readonly<Record<MapId, GroundPalette>> = {
  dawnvale: { ...palette, waterLevel: WATER_LEVEL, pathHalf: PATH_HALF_WIDTH },
  glowmoss: {
    grassLight: '#4f9a63',
    grassDark: '#2c654a',
    grassSun: '#78c79a',
    dirt: '#7d6048',
    dirtDark: '#5e4635',
    rock: '#7f8784',
    sand: '#9c8667',
    lakeBed: '#6c5a47',
    // 泥面只在渠道裡（渠底 −1.1）；林地本身的低處高度約 0，不能被畫成泥地
    waterLevel: CHANNEL_WATER_LEVEL - 0.55,
    pathHalf: TRAIL_HALF_WIDTH,
  },
  // 澄鏡湖（任務 9A，Bible §7.3）：水草綠的湖岸草坡、淺色沙灘、灰白圓石
  mirrorlake: {
    grassLight: '#8cc79a',
    grassDark: '#5d9a7e',
    grassSun: '#b4e0b0',
    dirt: '#c8ab7e',
    dirtDark: '#a2865e',
    rock: '#a7aeb0',
    sand: '#e6d7aa',
    lakeBed: '#9c9a7c',
    waterLevel: WATER_LEVEL,
    pathHalf: MIRRORLAKE_TRAIL_HALF_WIDTH,
  },
  // 風語草原（任務 9F，Bible §8.3）：嫩草綠、金黃的草尖、明亮的土路；山脊與台地邊緣露出暖灰的岩石
  whispermeadow: {
    grassLight: '#a8d86a',
    grassDark: '#6fae4a',
    grassSun: '#e6e08a',
    dirt: '#d9b77e',
    dirtDark: '#b8925a',
    rock: '#b5aa96',
    sand: '#e8d6a0',
    lakeBed: '#9c9a7c',
    waterLevel: WATER_LEVEL - 2,
    pathHalf: MEADOW_TRAIL_HALF_WIDTH,
  },
};

type GrassUniforms = { uGrassLight: { value: THREE.Color }; uGrassDark: { value: THREE.Color }; uGrassSun: { value: THREE.Color } };
const grassUniformSets = new Map<MapId, GrassUniforms>();

/** 草地色票 uniform（同一張地圖的地形與草叢共用同一組物件） */
export function grassUniformsFor(map: MapId): GrassUniforms {
  let set = grassUniformSets.get(map);
  if (!set) {
    const g = GROUND[map];
    set = {
      uGrassLight: { value: new THREE.Color(g.grassLight) },
      uGrassDark: { value: new THREE.Color(g.grassDark) },
      uGrassSun: { value: new THREE.Color(g.grassSun) },
    };
    grassUniformSets.set(map, set);
  }
  return set;
}

const SPLAT = /* glsl */ `
  {
    vec2 wp = vTerrainWorld.xz;
    // 草地底色 ＋ 細碎斑點
    vec3 grass = grassColorAt(wp);
    float speck = tNoise(wp * 1.7);
    grass *= 0.94 + 0.1 * smoothstep(0.35, 0.85, speck);

    // 泥土路：邊緣以雜訊擾動成不規則形狀，路中央略深（車轍感）
    float edgeNoise = (tFbm(wp * 0.35) - 0.5) * 0.9;
    float d = vPathDist + edgeNoise;
    float pathW = 1.0 - smoothstep(uPathHalf * 0.75, uPathHalf * 1.15, d);
    vec3 dirt = mix(uDirt, uDirtDark, smoothstep(0.4, 0.8, tFbm(wp * 0.6)) * 0.55);
    dirt = mix(dirt, uDirtDark, (1.0 - smoothstep(0.0, uPathHalf * 0.55, vPathDist)) * 0.25);
    // 碎石點
    float pebble = smoothstep(0.82, 0.86, tNoise(wp * 3.1 + 11.0));
    dirt = mix(dirt, uRock, pebble * 0.5);

    // 岩石：陡坡處露出
    float slope = 1.0 - clamp(vTerrainNormal.y, 0.0, 1.0);
    float rockW = smoothstep(0.18, 0.3, slope + (tNoise(wp * 0.5) - 0.5) * 0.12);
    vec3 rock = uRock * (0.9 + 0.2 * tNoise(wp * 2.3));

    vec3 col = mix(grass, dirt, pathW);
    col = mix(col, rock, rockW * (1.0 - pathW));

    // 湖岸：接近水面處為沙岸，水面下為較深的濕沙與湖底
    float h = vTerrainWorld.y;
    float shoreNoise = (tNoise(wp * 0.8) - 0.5) * 0.25;
    float sandW = 1.0 - smoothstep(uWaterLevel + 0.35, uWaterLevel + 0.85, h + shoreNoise);
    vec3 sand = mix(uSand, uSand * 0.82, tNoise(wp * 2.7) * 0.6);
    float bedW = 1.0 - smoothstep(uWaterLevel - 1.6, uWaterLevel - 0.1, h);
    sand = mix(sand, uLakeBed, bedW);
    col = mix(col, sand, sandW);
    diffuseColor.rgb *= col;
  }
`;

export function createTerrainMaterial(map: MapId = 'dawnvale'): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ gradientMap: toonGradient() });
  const g = GROUND[map];
  const uniforms = {
    ...grassUniformsFor(map),
    uDirt: { value: new THREE.Color(g.dirt) },
    uDirtDark: { value: new THREE.Color(g.dirtDark) },
    uRock: { value: new THREE.Color(g.rock) },
    uPathHalf: { value: g.pathHalf },
    uWaterLevel: { value: g.waterLevel },
    uSand: { value: new THREE.Color(g.sand) },
    uLakeBed: { value: new THREE.Color(g.lakeBed) },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aPathDist;
        varying float vPathDist;
        varying vec3 vTerrainWorld;
        varying vec3 vTerrainNormal;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vPathDist = aPathDist;
        vTerrainWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTerrainNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        ${GRASS_UNIFORMS_GLSL}
        uniform vec3 uDirt;
        uniform vec3 uDirtDark;
        uniform vec3 uRock;
        uniform float uPathHalf;
        uniform float uWaterLevel;
        uniform vec3 uSand;
        uniform vec3 uLakeBed;
        varying float vPathDist;
        varying vec3 vTerrainWorld;
        varying vec3 vTerrainNormal;
        ${TERRAIN_COLOR_GLSL}`,
      )
      .replace('#include <color_fragment>', `#include <color_fragment>\n${SPLAT}`);
  };
  material.customProgramCacheKey = () => 'terrain-splat';
  return patchMist(material);
}
