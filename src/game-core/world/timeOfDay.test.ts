import { describe, expect, it } from 'vitest';
import {
  WORLD_EPOCH_MS,
  worldClockAt,
  clockAt,
  DAY_REAL_SECONDS,
  dayIndex,
  formatClock,
  inTimeRange,
  moonPhase,
  moonPosition,
  secondsUntilHour,
  START_HOUR,
  sunPosition,
  SUNRISE,
  SUNSET,
  timePhase,
} from './timeOfDay';

const deg = 180 / Math.PI;

describe('clockAt', () => {
  it('starts a new game at 08:00', () => {
    expect(clockAt(0)).toBeCloseTo(START_HOUR);
    expect(dayIndex(0)).toBe(0);
  });

  it('a full day is 24 real minutes', () => {
    expect(clockAt(DAY_REAL_SECONDS)).toBeCloseTo(START_HOUR);
    expect(clockAt(DAY_REAL_SECONDS * 3 + 10)).toBeCloseTo(clockAt(10));
  });

  it('daytime (05:30–18:30) lasts 16 minutes and night 8 minutes', () => {
    const toSunset = secondsUntilHour(0, SUNSET);
    const toSunrise = secondsUntilHour(0, SUNRISE);
    expect(toSunrise - toSunset).toBeCloseTo(8 * 60);
    expect(DAY_REAL_SECONDS - (toSunrise - toSunset)).toBeCloseTo(16 * 60);
  });

  it('advances monotonically within a day and wraps after midnight', () => {
    let prev = clockAt(0);
    let wrapped = 0;
    for (let t = 5; t <= DAY_REAL_SECONDS; t += 5) {
      const h = clockAt(t);
      if (h < prev) wrapped++;
      prev = h;
    }
    expect(wrapped).toBe(1);
  });

  it('counts days at sunrise', () => {
    const sunrise = secondsUntilHour(0, SUNRISE);
    expect(dayIndex(sunrise - 1)).toBe(0);
    expect(dayIndex(sunrise + 1)).toBe(1);
  });
});

describe('secondsUntilHour', () => {
  it('lands on the requested hour', () => {
    for (const [time, hour] of [
      [0, 7],
      [100, 21],
      [900, 3],
      [5000, 12.25],
    ] as const) {
      expect(clockAt(time + secondsUntilHour(time, hour))).toBeCloseTo(hour, 5);
    }
  });

  it('only moves forward (less than one day)', () => {
    const d = secondsUntilHour(0, 7);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(DAY_REAL_SECONDS);
    expect(secondsUntilHour(0, START_HOUR)).toBeCloseTo(0);
  });
});

describe('sun and moon', () => {
  it('sun rises in the east, peaks around 60° at noon and sets in the west', () => {
    const rise = sunPosition(SUNRISE);
    expect(rise.elevation).toBeCloseTo(0);
    expect(rise.x).toBeGreaterThan(0.9);
    const noon = sunPosition(12);
    expect(noon.elevation * deg).toBeGreaterThan(55);
    expect(noon.elevation * deg).toBeLessThanOrEqual(60.01);
    expect(noon.z).toBeGreaterThan(0);
    const set = sunPosition(SUNSET);
    expect(set.elevation).toBeCloseTo(0);
    expect(set.x).toBeLessThan(-0.9);
    expect(sunPosition(23).elevation).toBeLessThan(0);
  });

  it('moon is up at night and below the horizon during the whole day', () => {
    expect(moonPosition(0).elevation * deg).toBeGreaterThan(40);
    for (let h = SUNRISE + 0.05; h < SUNSET; h += 0.25) expect(moonPosition(h).elevation, `moon at ${h}`).toBeLessThan(0);
    for (let h = SUNSET + 0.05; h < 24 + SUNRISE; h += 0.25) expect(moonPosition(h % 24).elevation, `moon at ${h}`).toBeGreaterThan(0);
  });

  it('sun is below the horizon during the whole night', () => {
    for (let h = SUNSET + 0.05; h < 24 + SUNRISE; h += 0.25) expect(sunPosition(h % 24).elevation, `sun at ${h}`).toBeLessThan(0);
  });

  it('direction vectors are unit length', () => {
    for (let h = 0; h < 24; h += 0.5) {
      const s = sunPosition(h);
      expect(Math.hypot(s.x, s.y, s.z)).toBeCloseTo(1);
    }
  });

  it('moon phase cycles every 8 days', () => {
    expect(moonPhase(0)).toBe(0);
    expect(moonPhase(4)).toBe(0.5);
    expect(moonPhase(8)).toBe(0);
  });
});

describe('phases and ranges', () => {
  it('names the time of day', () => {
    expect(timePhase(6)).toBe('dawn');
    expect(timePhase(12)).toBe('day');
    expect(timePhase(18)).toBe('dusk');
    expect(timePhase(22)).toBe('night');
    expect(timePhase(3)).toBe('night');
  });

  it('supports ranges across midnight', () => {
    expect(inTimeRange(23, 20, 4)).toBe(true);
    expect(inTimeRange(2, 20, 4)).toBe(true);
    expect(inTimeRange(12, 20, 4)).toBe(false);
    expect(inTimeRange(12, 9, 17)).toBe(true);
  });

  it('formats the clock', () => {
    expect(formatClock(8)).toBe('08:00');
    expect(formatClock(18.75)).toBe('18:45');
  });

  it('shared world clock: same instant gives the same hour for everyone, one day per 24 real minutes', () => {
    const t = Date.UTC(2026, 9, 17, 8, 43, 0);
    expect(clockAt(worldClockAt(t))).toBeCloseTo(clockAt(worldClockAt(t)), 10);
    // 起點正好是第 1 天（dayIndex 0）的日出
    expect(clockAt(worldClockAt(WORLD_EPOCH_MS))).toBeCloseTo(5.5, 5);
    expect(dayIndex(worldClockAt(WORLD_EPOCH_MS))).toBe(0);
    expect(clockAt(worldClockAt(t + DAY_REAL_SECONDS * 1000))).toBeCloseTo(clockAt(worldClockAt(t)), 5);
    expect(dayIndex(worldClockAt(t + DAY_REAL_SECONDS * 1000))).toBe(dayIndex(worldClockAt(t)) + 1);
  });
});
