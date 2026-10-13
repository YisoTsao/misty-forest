import * as THREE from 'three';
import { mistRuntime } from '@/game/world/mistRuntime';
import { fogRange, palette } from './palette';

/**
 * 迷霧外觀（規格 4.5）：單一 uniform `uMist`（0 = 晴朗，1 = 迷霧）驅動所有外觀，
 * 不做兩套場景。所有打過 patchMist 的材質共用同一個 uniform 物件，改一次全部生效。
 */
export const uMist = mistRuntime;

type LookEnds = {
  fogColor: string;
  fogNear: number;
  fogFar: number;
  skyZenith: string;
  skyHorizon: string;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  sunColor: string;
  sunIntensity: number;
};

/** 晴朗與迷霧兩端的外觀參數，中間值由 mistLook 插值。 */
const clear: LookEnds = {
  fogColor: palette.skyHorizon,
  fogNear: fogRange.near,
  fogFar: fogRange.far,
  skyZenith: palette.skyZenith,
  skyHorizon: palette.skyHorizon,
  hemiSky: palette.hemiSky,
  hemiGround: palette.hemiGround,
  hemiIntensity: 1.4,
  sunColor: palette.sun,
  sunIntensity: 2.4,
};

const misty: LookEnds = {
  fogColor: '#b3bdc6',
  fogNear: 3,
  fogFar: 75,
  skyZenith: '#9aa8b5',
  skyHorizon: '#bac3cb',
  hemiSky: '#c9d3dc',
  hemiGround: '#7b8a83',
  hemiIntensity: 1.2,
  sunColor: '#dfe6ee',
  sunIntensity: 0.65,
};

export type MistLook = {
  fogColor: THREE.Color;
  fogNear: number;
  fogFar: number;
  skyZenith: THREE.Color;
  skyHorizon: THREE.Color;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  sunColor: THREE.Color;
  sunIntensity: number;
};

export function createMistLook(): MistLook {
  return {
    fogColor: new THREE.Color(),
    fogNear: 0,
    fogFar: 0,
    skyZenith: new THREE.Color(),
    skyHorizon: new THREE.Color(),
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    hemiIntensity: 0,
    sunColor: new THREE.Color(),
    sunIntensity: 0,
  };
}

const ca = new THREE.Color();
const cb = new THREE.Color();
function lerpColor(out: THREE.Color, a: string, b: string, t: number): void {
  out.copy(ca.set(a)).lerp(cb.set(b), t);
}

/** 依 m（0–1）計算外觀，寫入 out（每幀呼叫，不配置新物件）。 */
export function mistLook(m: number, out: MistLook): MistLook {
  const t = THREE.MathUtils.clamp(m, 0, 1);
  lerpColor(out.fogColor, clear.fogColor, misty.fogColor, t);
  lerpColor(out.skyZenith, clear.skyZenith, misty.skyZenith, t);
  lerpColor(out.skyHorizon, clear.skyHorizon, misty.skyHorizon, t);
  lerpColor(out.hemiSky, clear.hemiSky, misty.hemiSky, t);
  lerpColor(out.hemiGround, clear.hemiGround, misty.hemiGround, t);
  lerpColor(out.sunColor, clear.sunColor, misty.sunColor, t);
  // 可見距離以幾何插值：體感上霧是「均勻變濃」，線性插值會在前半段幾乎沒變化
  out.fogNear = clear.fogNear * (misty.fogNear / clear.fogNear) ** t;
  out.fogFar = clear.fogFar * (misty.fogFar / clear.fogFar) ** t;
  out.hemiIntensity = THREE.MathUtils.lerp(clear.hemiIntensity, misty.hemiIntensity, t);
  out.sunIntensity = THREE.MathUtils.lerp(clear.sunIntensity, misty.sunIntensity, t);
  return out;
}

/** 迷霧時材質去飽和的最大比例與冷色偏移 */
const MIST_FRAGMENT = /* glsl */ `
  {
    float mistLuma = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
    vec3 mistCool = vec3(mistLuma) * vec3(0.93, 0.99, 1.07);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, mistCool, uMist * 0.6);
  }
  #include <fog_fragment>
`;

/**
 * 讓材質跟隨 uMist 去飽和、偏冷（規格 4.5：植被地形材質去飽和偏冷）。
 * 在霧之前套用，遠處仍由霧色接手。可重複呼叫，同一材質只會修補一次。
 */
export function patchMist<T extends THREE.Material>(material: T): T {
  if (material.userData.mistPatched) return material;
  material.userData.mistPatched = true;
  const previous = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    shader.uniforms.uMist = uMist;
    shader.fragmentShader = `uniform float uMist;\n${shader.fragmentShader.replace('#include <fog_fragment>', MIST_FRAGMENT)}`;
  };
  const previousKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${previousKey()}|mist`;
  return material;
}
