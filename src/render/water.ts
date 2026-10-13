import * as THREE from 'three';
import { ISLAND, LAKE } from '@/game-core/world/terrain';
import { patchMist } from './mist';
import { palette } from './palette';
import { toonGradient } from './toon';

/**
 * 湖面（規格 4.3：水面波紋）。不用反射與深度貼圖，以手繪感的色帶表現：
 * - 深淺：依到湖岸與小島的距離（與地形同一組湖泊參數）混合深水與淺水色。
 * - 波紋：兩組緩慢移動的雜訊線條提亮；岸邊一圈隨時間起伏的白色泡沫。
 * 透明度低，看得到淺水處的沙岸。所有水面共用 uTime（由 Water 元件每幀更新）。
 */
export const waterUniforms = { uTime: { value: 0 } };

export function createWaterMaterial(): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({
    gradientMap: toonGradient(),
    color: '#ffffff',
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
  });
  const uniforms = {
    ...waterUniforms,
    uDeep: { value: new THREE.Color(palette.waterDeep) },
    uShallow: { value: new THREE.Color(palette.waterShallow) },
    uFoam: { value: new THREE.Color(palette.waterFoam) },
    uLake: { value: new THREE.Vector3(LAKE.x, LAKE.z, LAKE.radius) },
    uIsland: { value: new THREE.Vector3(ISLAND.x, ISLAND.z, ISLAND.radius) },
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
        uniform vec3 uLake;
        uniform vec3 uIsland;
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
          // 到岸邊的距離（正值 = 離岸越遠越深）
          float toShore = min(uLake.z - 0.6 - distance(vWaterXZ, uLake.xy), distance(vWaterXZ, uIsland.xy) - uIsland.z - 1.4);
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
