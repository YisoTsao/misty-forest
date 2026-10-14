import * as THREE from 'three';
import { MAPS, type MapId } from '@/game-core/world/maps';
import { WATER_LEVEL } from '@/game-core/world/terrain';
import { getTerrainGrid, sampleGrid } from '@/game-core/world/terrainGrid';
import { patchMist } from './mist';
import { palette } from './palette';
import { toonGradient } from './toon';

/** 水深貼圖的解析度（覆蓋整張地形）與記錄的最大水深（公尺） */
const DEPTH_RES = 256;
const DEPTH_MAX = 4;

/**
 * 水深貼圖：由 terrainHeight 取樣「水面到地面的深度」，水面 shader 以此決定深淺色與岸邊泡沫。
 * 湖、溪、淺灘都適用，不需要為每個水域另外寫參數。8 bit 就夠（解析度約 1.6 cm）。
 */
export function createWaterDepthTexture(map: MapId = 'dawnvale'): THREE.DataTexture {
  const data = new Uint8Array(DEPTH_RES * DEPTH_RES);
  const grid = getTerrainGrid(map);
  const { origin, size } = MAPS[map];
  for (let j = 0; j < DEPTH_RES; j++) {
    const z = origin.z + ((j + 0.5) / DEPTH_RES - 0.5) * size;
    for (let i = 0; i < DEPTH_RES; i++) {
      const x = origin.x + ((i + 0.5) / DEPTH_RES - 0.5) * size;
      const depth = WATER_LEVEL - sampleGrid(grid, grid.height, x, z);
      data[j * DEPTH_RES + i] = Math.round(Math.min(1, Math.max(0, depth / DEPTH_MAX)) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, DEPTH_RES, DEPTH_RES, THREE.RedFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * 水面（規格 4.3：水面波紋）。不用反射，以手繪感的色帶表現：
 * - 深淺：依水深貼圖（湖、溪共用）混合深水與淺水色。
 * - 波紋：兩組緩慢移動的雜訊線條提亮；岸邊一圈隨時間起伏的白色泡沫。
 * 透明度低，看得到淺水處的沙岸。所有水面共用 uTime（由 Water 元件每幀更新）。
 */
export const waterUniforms = { uTime: { value: 0 } };

/** 各地圖的水色（任務 9A：澄鏡湖用 Bible §7.3 的湖水藍，比溪水清透） */
const WATER_COLORS: Readonly<Record<MapId, { deep: string; shallow: string }>> = {
  dawnvale: { deep: palette.waterDeep, shallow: palette.waterShallow },
  glowmoss: { deep: palette.waterDeep, shallow: palette.waterShallow },
  mirrorlake: { deep: '#3f93b8', shallow: '#77c9df' },
};

export function createWaterMaterial(depthTexture: THREE.Texture, map: MapId = 'dawnvale'): THREE.MeshToonMaterial {
  const { origin, size } = MAPS[map];
  const material = new THREE.MeshToonMaterial({
    gradientMap: toonGradient(),
    color: '#ffffff',
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
  });
  const uniforms = {
    ...waterUniforms,
    uDeep: { value: new THREE.Color(WATER_COLORS[map].deep) },
    uShallow: { value: new THREE.Color(WATER_COLORS[map].shallow) },
    uFoam: { value: new THREE.Color(palette.waterFoam) },
    uDepthTex: { value: depthTexture },
    uDepthScale: { value: new THREE.Vector2(1 / size, DEPTH_MAX) },
    uDepthOrigin: { value: new THREE.Vector2(origin.x, origin.z) },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWaterXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWaterXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        uniform vec3 uFoam;
        uniform sampler2D uDepthTex;
        uniform vec2 uDepthScale;
        uniform vec2 uDepthOrigin;
        varying vec2 vWaterXZ;
        float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float wNoise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(wHash(i), wHash(i + vec2(1, 0)), u.x), mix(wHash(i + vec2(0, 1)), wHash(i + vec2(1, 1)), u.x), u.y);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          // 水深（公尺）：岸邊為 0；toShore 換算成與舊版相近的「離岸距離」，泡沫寬度不變
          float waterDepth = texture2D(uDepthTex, (vWaterXZ - uDepthOrigin) * uDepthScale.x + 0.5).r * uDepthScale.y;
          if (waterDepth <= 0.0) discard;
          float toShore = waterDepth * 2.2;
          float depth = smoothstep(0.0, 5.0, toShore);
          vec3 col = mix(uShallow, uDeep, depth);
          // 波紋：兩組方向不同、緩慢流動的細線
          vec2 p = vWaterXZ;
          float r1 = wNoise(p * vec2(0.55, 1.6) + vec2(uTime * 0.25, 0.0));
          float r2 = wNoise(p * vec2(1.4, 0.5) - vec2(0.0, uTime * 0.18));
          float ripple = smoothstep(0.78, 0.86, r1) + smoothstep(0.8, 0.88, r2);
          col = mix(col, uShallow * 1.25, clamp(ripple, 0.0, 1.0) * 0.45);
          // 岸邊泡沫：隨時間微微起伏
          float foamBand = 0.5 + 0.35 * sin(uTime * 1.3 + wNoise(p * 0.9) * 6.0);
          float foam = 1.0 - smoothstep(0.0, foamBand, toShore);
          foam *= step(0.35, wNoise(p * 2.2 + uTime * 0.2));
          col = mix(col, uFoam, foam * 0.8);
          diffuseColor.rgb *= col;
        }`,
      )
      // 水面一律朝上受光，不因為視角出現暗面
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
  };
  material.customProgramCacheKey = () => 'water';
  return patchMist(material);
}
