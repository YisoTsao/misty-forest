import * as THREE from 'three';
import { mistRuntime } from '@/game/world/mistRuntime';
import { currentTimeLook } from './timeLook';

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

/**
 * 迷霧端的外觀參數（白天）。晴朗端來自目前時段的外觀（timeLook.ts，白天即原本的晴朗色票）；
 * 迷霧端的顏色乘上時段色調、強度依時段等比例縮放，夜晚的霧不會發亮。
 */
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
  /** 方向光（白天太陽、夜晚月亮）的顏色與強度 */
  sunColor: THREE.Color;
  sunIntensity: number;
  /** 不受光照材質（遠山、地面延伸）乘上的顏色 */
  ambient: THREE.Color;
  /** 星空亮度 0–1（迷霧時看不到） */
  stars: number;
  /** 太陽方向地平線暖光暈強度 */
  glow: number;
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
    ambient: new THREE.Color(),
    stars: 0,
    glow: 0,
  };
}

/** 白天晴朗端的強度：迷霧端強度依目前時段等比例縮放 */
const DAY_HEMI = 1.4;
const DAY_SUN = 2.4;

const cm = new THREE.Color();
function lerpToMisty(out: THREE.Color, clear: THREE.Color, mistyHex: string, tint: THREE.Color, t: number): void {
  out.copy(clear).lerp(cm.set(mistyHex).multiply(tint), t);
}

/**
 * 依 m（0–1）計算外觀，寫入 out（每幀呼叫，不配置新物件）。
 * 晴朗端為目前時段的外觀（Lighting 每幀以 updateTimeLook 更新；預設白天）。
 */
export function mistLook(m: number, out: MistLook): MistLook {
  const t = THREE.MathUtils.clamp(m, 0, 1);
  const time = currentTimeLook;
  const tint = time.mistTint;
  lerpToMisty(out.fogColor, time.fog, misty.fogColor, tint, t);
  lerpToMisty(out.skyZenith, time.zenith, misty.skyZenith, tint, t);
  lerpToMisty(out.skyHorizon, time.horizon, misty.skyHorizon, tint, t);
  lerpToMisty(out.hemiSky, time.hemiSky, misty.hemiSky, tint, t);
  lerpToMisty(out.hemiGround, time.hemiGround, misty.hemiGround, tint, t);
  lerpToMisty(out.sunColor, time.light, misty.sunColor, tint, t);
  // 可見距離以幾何插值：體感上霧是「均勻變濃」，線性插值會在前半段幾乎沒變化
  out.fogNear = time.fogNear * (misty.fogNear / time.fogNear) ** t;
  out.fogFar = time.fogFar * (misty.fogFar / time.fogFar) ** t;
  out.hemiIntensity = THREE.MathUtils.lerp(time.hemiIntensity, misty.hemiIntensity * (time.hemiIntensity / DAY_HEMI), t);
  out.sunIntensity = THREE.MathUtils.lerp(time.lightIntensity, misty.sunIntensity * (time.lightIntensity / DAY_SUN), t);
  out.ambient.copy(time.ambient);
  out.stars = time.stars * (1 - t);
  out.glow = time.glow * (1 - t * 0.8);
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
