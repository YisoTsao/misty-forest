import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { palette } from './palette';
import { createTimeLook, timeLook } from './timeLook';

const luma = (c: THREE.Color) => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;

describe('timeLook', () => {
  it('daytime matches the clear palette (no change to existing daytime look)', () => {
    const look = timeLook(12, createTimeLook());
    expect(look.zenith.getHexString()).toBe(new THREE.Color(palette.skyZenith).getHexString());
    expect(look.light.getHexString()).toBe(new THREE.Color(palette.sun).getHexString());
    expect(look.lightIntensity).toBeCloseTo(2.4);
    expect(look.stars).toBe(0);
  });

  it('night is darker and bluer but keeps a minimum of light', () => {
    const day = timeLook(12, createTimeLook());
    const night = timeLook(0, createTimeLook());
    expect(luma(night.zenith)).toBeLessThan(luma(day.zenith) * 0.4);
    expect(night.hemiSky.b).toBeGreaterThan(night.hemiSky.r);
    expect(night.hemiIntensity).toBeGreaterThan(0.8);
    expect(night.lightIntensity).toBeGreaterThan(0.5);
    expect(night.stars).toBe(1);
  });

  it('directional light fades out at sunrise and sunset (source switches there)', () => {
    expect(timeLook(5.5, createTimeLook()).lightIntensity).toBeCloseTo(0);
    expect(timeLook(18.5, createTimeLook()).lightIntensity).toBeCloseTo(0);
    expect(timeLook(18.0, createTimeLook()).glow).toBeGreaterThan(0.5);
  });

  it('wraps around midnight and changes continuously', () => {
    const a = timeLook(23.99, createTimeLook());
    const b = timeLook(0.01, createTimeLook());
    expect(a.zenith.getHexString()).toBe(b.zenith.getHexString());
    const prev = createTimeLook();
    const cur = createTimeLook();
    timeLook(0, prev);
    for (let h = 0.05; h < 24; h += 0.05) {
      timeLook(h, cur);
      expect(Math.abs(cur.lightIntensity - prev.lightIntensity)).toBeLessThan(0.2);
      expect(Math.abs(luma(cur.horizon) - luma(prev.horizon))).toBeLessThan(0.08);
      timeLook(h, prev);
    }
  });
});
