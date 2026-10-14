import * as THREE from 'three';
import type { MapId } from '@/game-core/world/maps';
import { palette, fogRange } from './palette';

/**
 * 日夜外觀（GAME_DESIGN 5.2）：依時鐘（小時）在關鍵時刻之間插值出「晴朗時」的天空、霧、光線顏色。
 * 迷霧外觀（mist.ts）再以這組值為晴朗端，往迷霧端混合；迷霧端的顏色也乘上本時段的色調，夜晚的霧不會發亮。
 * 夜晚不做真黑夜：月光 + 偏藍的半球光保底，道路、角色與攻擊預兆都看得清楚（Bible 13.5）。
 */

type Key = {
  hour: number;
  zenith: string;
  horizon: string;
  fog: string;
  /** 霧的可見距離倍率（夜晚稍近，更有氣氛） */
  fogScale: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  /** 方向光（白天為太陽、夜晚為月亮）的顏色與強度；日出日落時降到 0 再換光源 */
  light: string;
  lightIntensity: number;
  /** 不受光照的材質（遠山、地面延伸、天空中的雲提亮）乘上的顏色 */
  ambient: string;
  /** 迷霧端顏色乘上的色調 */
  mistTint: string;
  /** 星空亮度 0–1 */
  stars: number;
  /** 太陽方向地平線的暖色光暈強度 */
  glow: number;
};

const NIGHT: Omit<Key, 'hour'> = {
  zenith: '#0d1838',
  horizon: '#2a3866',
  fog: '#26335c',
  fogScale: 0.75,
  hemiSky: '#5a6fb0',
  hemiGround: '#24323a',
  hemiIntensity: 1.05,
  light: '#a9c0ff',
  lightIntensity: 0.75,
  ambient: '#3a4a78',
  mistTint: '#4b5781',
  stars: 1,
  glow: 0,
};

const DAY: Omit<Key, 'hour'> = {
  zenith: palette.skyZenith,
  horizon: palette.skyHorizon,
  fog: palette.skyHorizon,
  fogScale: 1,
  hemiSky: palette.hemiSky,
  hemiGround: palette.hemiGround,
  hemiIntensity: 1.4,
  light: palette.sun,
  lightIntensity: 2.4,
  ambient: '#ffffff',
  mistTint: '#ffffff',
  stars: 0,
  glow: 0,
};

/** 依小時排序；0 與 24 相同，插值時繞回 */
const KEYS: Key[] = [
  { hour: 0, ...NIGHT },
  { hour: 4.6, ...NIGHT, horizon: '#33406f' },
  {
    hour: 5.5,
    zenith: '#36508f',
    horizon: '#f0a07a',
    fog: '#b88d92',
    fogScale: 0.85,
    hemiSky: '#8a98c6',
    hemiGround: '#46543e',
    hemiIntensity: 1.05,
    light: '#ffa070',
    lightIntensity: 0,
    ambient: '#9a8aa0',
    mistTint: '#b4a3ac',
    stars: 0.35,
    glow: 1,
  },
  {
    hour: 6.6,
    zenith: '#5c9be0',
    horizon: '#ffd3a8',
    fog: '#f2d6bf',
    fogScale: 0.95,
    hemiSky: '#b6d3f0',
    hemiGround: '#64864a',
    hemiIntensity: 1.25,
    light: '#ffcf98',
    lightIntensity: 1.7,
    ambient: '#f2e0d0',
    mistTint: '#f0e0d6',
    stars: 0,
    glow: 0.7,
  },
  { hour: 8, ...DAY },
  { hour: 16, ...DAY },
  {
    hour: 17.5,
    zenith: '#5895d6',
    horizon: '#ffd49a',
    fog: '#f5d6a8',
    fogScale: 0.95,
    hemiSky: '#d6d0bc',
    hemiGround: '#728e48',
    hemiIntensity: 1.3,
    light: '#ffbf78',
    lightIntensity: 2.0,
    ambient: '#fbe6c8',
    mistTint: '#f3dfc6',
    stars: 0,
    glow: 0.8,
  },
  {
    hour: 18.5,
    zenith: '#36498a',
    horizon: '#ee8a78',
    fog: '#a98aa6',
    fogScale: 0.85,
    hemiSky: '#8a86ba',
    hemiGround: '#46483e',
    hemiIntensity: 1.05,
    light: '#ff9466',
    lightIntensity: 0,
    ambient: '#8c7c98',
    mistTint: '#a898ac',
    stars: 0.3,
    glow: 1,
  },
  { hour: 19.6, ...NIGHT, horizon: '#424a84', fog: '#323d6c', stars: 0.85 },
  { hour: 24, ...NIGHT },
];

export type TimeLook = {
  hour: number;
  zenith: THREE.Color;
  horizon: THREE.Color;
  fog: THREE.Color;
  fogNear: number;
  fogFar: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  light: THREE.Color;
  lightIntensity: number;
  ambient: THREE.Color;
  mistTint: THREE.Color;
  stars: number;
  glow: number;
};

export function createTimeLook(): TimeLook {
  return {
    hour: 0,
    zenith: new THREE.Color(),
    horizon: new THREE.Color(),
    fog: new THREE.Color(),
    fogNear: 0,
    fogFar: 0,
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    hemiIntensity: 0,
    light: new THREE.Color(),
    lightIntensity: 0,
    ambient: new THREE.Color(),
    mistTint: new THREE.Color(),
    stars: 0,
    glow: 0,
  };
}

const ca = new THREE.Color();
const cb = new THREE.Color();
function mixColor(out: THREE.Color, a: string, b: string, t: number): void {
  out.copy(ca.set(a)).lerp(cb.set(b), t);
}

/** 依時鐘（小時）計算外觀，寫入 out（每幀呼叫，不配置新物件）。 */
export function timeLook(hour: number, out: TimeLook): TimeLook {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1]!.hour <= h) i++;
  const a = KEYS[i]!;
  const b = KEYS[i + 1]!;
  const raw = (h - a.hour) / (b.hour - a.hour);
  // 平滑插值，關鍵時刻附近變化較緩
  const t = raw * raw * (3 - 2 * raw);
  out.hour = h;
  mixColor(out.zenith, a.zenith, b.zenith, t);
  mixColor(out.horizon, a.horizon, b.horizon, t);
  mixColor(out.fog, a.fog, b.fog, t);
  mixColor(out.hemiSky, a.hemiSky, b.hemiSky, t);
  mixColor(out.hemiGround, a.hemiGround, b.hemiGround, t);
  mixColor(out.light, a.light, b.light, t);
  mixColor(out.ambient, a.ambient, b.ambient, t);
  mixColor(out.mistTint, a.mistTint, b.mistTint, t);
  const scale = THREE.MathUtils.lerp(a.fogScale, b.fogScale, t);
  out.fogNear = fogRange.near * scale;
  out.fogFar = fogRange.far * scale;
  out.hemiIntensity = THREE.MathUtils.lerp(a.hemiIntensity, b.hemiIntensity, t);
  out.lightIntensity = THREE.MathUtils.lerp(a.lightIntensity, b.lightIntensity, t);
  out.stars = THREE.MathUtils.lerp(a.stars, b.stars, t);
  out.glow = THREE.MathUtils.lerp(a.glow, b.glow, t);
  return out;
}

/**
 * 夜晚的程度（0 白天 → 1 深夜）：以星星的可見度換算（glow 是黃昏的天空光暈，不是夜晚）。
 * 給夜間才亮的東西用（任務 7N 村屋窗燈、燈塔光柱）。
 */
export function nightAmount(look: TimeLook): number {
  return Math.min(1, Math.max(0, look.stars / 0.7));
}

/** 目前畫面使用的時段外觀：Lighting 每幀以 updateTimeLook 更新，mistLook 讀取。預設為白天。 */
export const currentTimeLook = timeLook(8, createTimeLook());

export function updateTimeLook(hour: number): TimeLook {
  return timeLook(hour, currentTimeLook);
}

const FOREST = {
  fog: new THREE.Color('#6f9a8a'),
  hemiSky: new THREE.Color('#a8d8c2'),
  hemiGround: new THREE.Color('#2f5a44'),
  light: new THREE.Color('#e8f4dc'),
  horizon: new THREE.Color('#9fcab8'),
};

/**
 * 地圖的光線色調（任務 8A）：螢苔祕林在樹冠下，霧偏青綠、可見距離較短，陽光被樹葉濾過而較弱。
 * 在 updateTimeLook 之後就地修改目前的時段外觀（每幀重算，不會累積）。
 */
export function tintTimeLookForMap(map: MapId, look: TimeLook = currentTimeLook): TimeLook {
  if (map !== 'glowmoss') return look;
  look.fog.lerp(FOREST.fog, 0.35);
  look.horizon.lerp(FOREST.horizon, 0.3);
  look.hemiSky.lerp(FOREST.hemiSky, 0.3);
  look.hemiGround.lerp(FOREST.hemiGround, 0.5);
  look.light.lerp(FOREST.light, 0.3);
  look.lightIntensity *= 0.78;
  look.fogNear *= 0.7;
  look.fogFar *= 0.72;
  return look;
}
