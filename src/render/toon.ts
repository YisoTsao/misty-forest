import * as THREE from 'three';
import { patchMist } from './mist';

let sharedGradient: THREE.DataTexture | null = null;

/**
 * 三階 toon ramp（規格 4.2）。全專案共用一張，不在每個材質重複建立。
 * 數值偏亮，避免卡通陰影過黑。
 */
export function toonGradient(): THREE.DataTexture {
  if (sharedGradient) return sharedGradient;
  const steps = [150, 210, 255];
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  sharedGradient = tex;
  return tex;
}

/** 將 GLB 內的 PBR 材質轉為 toon 材質，保留底色與貼圖，並跟隨迷霧外觀。 */
export function toToonMaterial(source: THREE.Material): THREE.MeshToonMaterial {
  const toon = new THREE.MeshToonMaterial({ gradientMap: toonGradient() });
  if (source instanceof THREE.MeshStandardMaterial || source instanceof THREE.MeshBasicMaterial) {
    toon.color.copy(source.color);
    toon.map = source.map;
    toon.transparent = source.transparent;
    toon.alphaTest = source.alphaTest;
    toon.side = source.side;
  }
  toon.name = `${source.name}_toon`;
  return patchMist(toon);
}
