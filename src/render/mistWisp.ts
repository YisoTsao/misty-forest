import * as THREE from 'three';
import { patchMist } from './mist';
import { toonGradient } from './toon';

/**
 * 迷霧生物（規格 6.6：一種敵人）。沒有骨架：身體是一團會蠕動的霧（頂點以雜訊起伏），
 * 邊緣透出淡紫色的光，兩顆發光的眼睛；被擊中閃白、消失時淡出。每隻一份材質（uniform 各自獨立，數量很少）。
 */
export type WispUniforms = {
  uTime: { value: number };
  uSeed: { value: number };
  uFlash: { value: number };
  uOpacity: { value: number };
  /** 攻擊前搖時身體鼓起、邊緣變紅（0–1） */
  uCharge: { value: number };
};

export function createWispMaterial(seed: number): { material: THREE.MeshToonMaterial; uniforms: WispUniforms } {
  const uniforms: WispUniforms = {
    uTime: { value: 0 },
    uSeed: { value: seed },
    uFlash: { value: 0 },
    uOpacity: { value: 1 },
    uCharge: { value: 0 },
  };
  const material = new THREE.MeshToonMaterial({ gradientMap: toonGradient(), color: '#5a5384', transparent: true, depthWrite: true });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uSeed;
        uniform float uCharge;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // 蠕動：幾組不同頻率的波疊加；下半身往下拉長成霧尾
        float wob = sin(uTime * 2.3 + position.y * 5.0 + uSeed) * 0.06
                  + sin(uTime * 3.1 + position.x * 6.0 + uSeed * 1.7) * 0.05
                  + sin(uTime * 1.7 + position.z * 4.0 + uSeed * 2.3) * 0.05;
        transformed += normal * (wob + uCharge * 0.12);
        float below = clamp(-position.y / 0.55, 0.0, 1.0);
        transformed.y -= below * below * (0.35 + 0.08 * sin(uTime * 2.0 + uSeed));
        transformed.xz *= 1.0 - below * 0.45;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uFlash;
        uniform float uOpacity;
        uniform float uCharge;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float rim = 1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0);
        vec3 rimColor = mix(vec3(0.72, 0.62, 1.0), vec3(1.0, 0.35, 0.35), uCharge);
        totalEmissiveRadiance += rimColor * pow(rim, 2.2) * 0.9;
        totalEmissiveRadiance += vec3(uFlash);`,
      )
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a *= uOpacity;');
  };
  material.customProgramCacheKey = () => 'mist-wisp';
  return { material: patchMist(material), uniforms };
}

let eyeMaterial: THREE.MeshBasicMaterial | null = null;
/** 眼睛：亮度超過 1，交給 Bloom 發光（共用一份） */
export function wispEyeMaterial(): THREE.MeshBasicMaterial {
  eyeMaterial ??= new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.9, 0.9), toneMapped: false, transparent: true });
  return eyeMaterial;
}
