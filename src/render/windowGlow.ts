import * as THREE from 'three';

/**
 * 村屋窗燈（任務 7N，Bible §5.3、§16「夜間窗戶亮燈」）：KayKit 六角包的建築共用一張漸層色票貼圖，
 * 窗戶玻璃的面都對到色票的同一格（第 7 欄第 2 列的灰褐色；以模型的 UV 統計確認：牆面高度、朝外的小面）。夜晚讓這一格發出暖黃的光，白天不變。
 * uWindowGlow 由 WindowGlowDriver 依時段（timeLook 的 glow）每幀更新，所有房子共用。
 */
export const windowGlowUniforms = {
  uWindowGlow: { value: 0 },
  uWindowColor: { value: new THREE.Color('#ffc46b').multiplyScalar(1.6) },
};

/** 窗戶在色票上的那一格（UV，glTF 左上角為原點） */
export const WINDOW_CELL = { u0: 0.75, u1: 0.875, v0: 0.25, v1: 0.5 } as const;

/** 除錯與測試：加上窗燈的材質數、編譯過的數量 */
export const windowGlowStats = { patched: 0, compiled: 0 };

export function patchWindowGlow<T extends THREE.Material>(material: T): T {
  if (material.userData.windowPatched) return material;
  material.userData.windowPatched = true;
  windowGlowStats.patched++;
  const previous = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    windowGlowStats.compiled++;
    Object.assign(shader.uniforms, windowGlowUniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWindowGlow;\nuniform vec3 uWindowColor;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
#ifdef USE_MAP
  if (uWindowGlow > 0.0 && vMapUv.x > ${WINDOW_CELL.u0.toFixed(3)} && vMapUv.x < ${WINDOW_CELL.u1.toFixed(3)} && vMapUv.y > ${WINDOW_CELL.v0.toFixed(3)} && vMapUv.y < ${WINDOW_CELL.v1.toFixed(3)}) {
    totalEmissiveRadiance += uWindowColor * uWindowGlow;
  }
#endif`,
      );
  };
  const previousKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${previousKey()}|windows`;
  return material;
}
