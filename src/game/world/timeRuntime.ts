// 日夜循環的本機暫態（GAME_DESIGN 5.2）：由共享世界時鐘（game/world/worldClock）每幀換算，
// 這裡在兩次之間補上經過的時間，讓太陽與月亮平滑移動。由 GameClock 每幀寫入，Lighting / Sky / 環境效果讀取。
import {
  clockAt,
  createCelestial,
  dayIndex,
  moonPhase,
  moonPosition,
  sunPosition,
  SUNRISE,
  SUNSET,
} from '@/game-core/world/timeOfDay';

/** 光源（太陽或月亮）方向的最低仰角：太低時陰影會拉得很長、超出陰影範圍 */
const MIN_LIGHT_ELEVATION = (12 * Math.PI) / 180;

export const timeRuntime = {
  /** 共享世界時鐘（秒，每幀更新） */
  time: 0,
  /** 時鐘（小時，0–24） */
  hour: 8,
  day: 0,
  moonPhase: 0,
  sun: createCelestial(),
  moon: createCelestial(),
  /** 目前方向光跟隨月亮（夜晚） */
  moonLight: false,
  /** 方向光的方向（指向光源的單位向量，仰角已限制下限） */
  lightDir: { x: 0, y: 1, z: 0 },
  /** 夜晚程度 0–1（星空、螢火蟲、燈光加強用） */
  night: 0,
  /** 畫面實際使用的時段（室內固定為正午；Lighting 寫入） */
  lookHour: 8,
  /** 方向光目前的強度（含迷霧；Lighting 寫入，除錯與測試用） */
  lightIntensity: 0,
};

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function updateTimeRuntime(time: number): void {
  const r = timeRuntime;
  r.time = time;
  r.hour = clockAt(time);
  r.day = dayIndex(time);
  r.moonPhase = moonPhase(r.day);
  sunPosition(r.hour, r.sun);
  moonPosition(r.hour, r.moon);
  r.moonLight = r.hour >= SUNSET || r.hour < SUNRISE;
  const src = r.moonLight ? r.moon : r.sun;
  // 限制最低仰角：保留方位，把仰角抬到下限
  const elevation = Math.max(src.elevation, MIN_LIGHT_ELEVATION);
  const horizontal = Math.hypot(src.x, src.z) || 1;
  const cosE = Math.cos(elevation);
  r.lightDir.x = (src.x / horizontal) * cosE;
  r.lightDir.y = Math.sin(elevation);
  r.lightDir.z = (src.z / horizontal) * cosE;
  // 日落後一小時內轉成夜晚、日出前一小時開始退去
  const h = r.hour;
  r.night = h >= 12 ? smoothstep(SUNSET - 0.3, SUNSET + 1, h) : 1 - smoothstep(SUNRISE - 1, SUNRISE + 0.4, h);
}

updateTimeRuntime(0);
