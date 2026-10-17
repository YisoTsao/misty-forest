// 日夜循環（GAME_DESIGN 5.2、決策 G-04）：由權威狀態的遊玩秒數推導時鐘，存檔格式不需要另外欄位。
// 一天 = 現實 24 分鐘：白天 05:30–18:30（13 小時）佔 16 分鐘，夜晚（11 小時）佔 8 分鐘。

/** 一個遊戲日的現實秒數 */
export const DAY_REAL_SECONDS = 24 * 60;
/** 日出與日落（遊戲時鐘的小時） */
export const SUNRISE = 5.5;
export const SUNSET = 18.5;
const DAY_HOURS = SUNSET - SUNRISE;
const NIGHT_HOURS = 24 - DAY_HOURS;
/** 白天佔的現實秒數 */
const DAY_PART = 16 * 60;
const NIGHT_PART = DAY_REAL_SECONDS - DAY_PART;
/** 新遊戲（time = 0）從早上 8 點開始 */
export const START_HOUR = 8;

/** 從日出起算的現實秒數 → 時鐘（小時，0–24） */
function hourFromCycle(s: number): number {
  if (s < DAY_PART) return SUNRISE + (s / DAY_PART) * DAY_HOURS;
  const h = SUNSET + ((s - DAY_PART) / NIGHT_PART) * NIGHT_HOURS;
  return h >= 24 ? h - 24 : h;
}

/** 時鐘（小時）→ 從日出起算的現實秒數（0 ≤ s < DAY_REAL_SECONDS） */
function cycleFromHour(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  const sinceSunrise = (h - SUNRISE + 24) % 24;
  if (sinceSunrise <= DAY_HOURS) return (sinceSunrise / DAY_HOURS) * DAY_PART;
  return DAY_PART + ((sinceSunrise - DAY_HOURS) / NIGHT_HOURS) * NIGHT_PART;
}

const START_OFFSET = cycleFromHour(START_HOUR);

/** 共享世界時鐘的起點（UTC 2026-10-17 00:00，共享日光上線那天）：這一刻是第 1 天的日出 */
export const WORLD_EPOCH_MS = Date.UTC(2026, 9, 17);

/**
 * 共享世界時鐘（使用者 2026-10-17：所有玩家看到同一個日夜，不能一個白天一個晚上）：
 * Unix 時間（毫秒）→ clockAt / dayIndex 用的秒數。從 WORLD_EPOCH_MS 的日出起算，每 24 分鐘一個遊戲日，
 * 所以不論何時開始玩、玩了多久，同一個時刻算出來的時段都一樣。遊玩秒數（GameState.time）只管重生與成長。
 */
export function worldClockAt(epochMs: number): number {
  return (epochMs - WORLD_EPOCH_MS) / 1000 - START_OFFSET;
}

/** 從日出起算、未取餘數的現實秒數 */
function cycleSeconds(time: number): number {
  return time + START_OFFSET;
}

/** 遊玩秒數 → 時鐘（小時，0 ≤ h < 24） */
export function clockAt(time: number): number {
  const s = cycleSeconds(time);
  return hourFromCycle(((s % DAY_REAL_SECONDS) + DAY_REAL_SECONDS) % DAY_REAL_SECONDS);
}

/** 第幾天（新遊戲為第 0 天，每次日出加 1） */
export function dayIndex(time: number): number {
  return Math.floor(cycleSeconds(time) / DAY_REAL_SECONDS);
}

/** 從 time 往後要經過多少遊玩秒數才會到達 hour（已在該時刻則為 0；只往前，不倒轉） */
export function secondsUntilHour(time: number, hour: number): number {
  const now = ((cycleSeconds(time) % DAY_REAL_SECONDS) + DAY_REAL_SECONDS) % DAY_REAL_SECONDS;
  const target = cycleFromHour(hour);
  const d = target - now;
  // 浮點誤差內視為已在該時刻
  if (Math.abs(d) < 1e-6) return 0;
  return d > 0 ? d : d + DAY_REAL_SECONDS;
}

export type TimePhase = 'dawn' | 'day' | 'dusk' | 'night';

export function timePhase(hour: number): TimePhase {
  if (hour >= SUNRISE && hour < 7.5) return 'dawn';
  if (hour >= 7.5 && hour < 17) return 'day';
  if (hour >= 17 && hour < 19) return 'dusk';
  return 'night';
}

/** hour 是否在 [from, to) 內；from > to 表示跨午夜（例如 20–4） */
export function inTimeRange(hour: number, from: number, to: number): boolean {
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
}

export type CelestialPosition = {
  /** 仰角（弧度），地平線下為負 */
  elevation: number;
  /** 指向天體的單位向量（x 東、y 上、z 南） */
  x: number;
  y: number;
  z: number;
};

/** 太陽正午的最大仰角與月亮午夜的最大仰角 */
const SUN_MAX_ELEVATION = (60 * Math.PI) / 180;
const MOON_MAX_ELEVATION = (50 * Math.PI) / 180;

/**
 * 天體軌道：f 為從升起起算的時間（以「在地平線上的時長」為 1）；period 為一整個週期（24 小時）換算後的長度。
 * 0–1 在地平線上（東 → 最高 → 西），1–period 在地平線下（西 → 最低 → 東），兩段各自是半個正弦，
 * 所以白天與夜晚長度不同時也不會在錯誤的時間冒出地平線。
 */
function arc(f: number, period: number, maxElevation: number, out: CelestialPosition): CelestialPosition {
  const p = ((f % period) + period) % period;
  const above = p <= 1;
  const g = above ? p : (p - 1) / (period - 1);
  const a = Math.PI * g;
  const elevation = (above ? 1 : -1) * Math.sin(a) * maxElevation;
  // 方位：在地平線上時 東（+x）→ 南（+z，略偏）→ 西（−x）；地平線下沿北側回到東方
  const cosA = above ? Math.cos(a) : -Math.cos(a);
  const sinA = above ? Math.sin(a) : -Math.sin(a);
  const cosE = Math.cos(elevation);
  out.elevation = elevation;
  out.x = cosA * cosE;
  out.y = Math.sin(elevation);
  out.z = sinA * 0.55 * cosE;
  const len = Math.hypot(out.x, out.y, out.z);
  out.x /= len;
  out.y /= len;
  out.z /= len;
  return out;
}

export function createCelestial(): CelestialPosition {
  return { elevation: 0, x: 0, y: 1, z: 0 };
}

/** 太陽位置：05:30 從東方升起、正午最高、18:30 在西方落下。 */
export function sunPosition(hour: number, out: CelestialPosition = createCelestial()): CelestialPosition {
  return arc((hour - SUNRISE) / DAY_HOURS, 24 / DAY_HOURS, SUN_MAX_ELEVATION, out);
}

/** 月亮位置：日落時從東方升起、午夜附近最高、日出時落下。 */
export function moonPosition(hour: number, out: CelestialPosition = createCelestial()): CelestialPosition {
  const sinceSunset = (hour - SUNSET + 24) % 24;
  return arc(sinceSunset / NIGHT_HOURS, 24 / NIGHT_HOURS, MOON_MAX_ELEVATION, out);
}

/** 月相 0–1：0 = 滿月、0.5 = 新月；8 天一個循環 */
export const MOON_CYCLE_DAYS = 8;
export function moonPhase(day: number): number {
  return (((day % MOON_CYCLE_DAYS) + MOON_CYCLE_DAYS) % MOON_CYCLE_DAYS) / MOON_CYCLE_DAYS;
}

/** 時鐘顯示文字（HH:MM） */
export function formatClock(hour: number): string {
  const total = Math.floor(hour * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
