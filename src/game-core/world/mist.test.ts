import { describe, expect, it } from 'vitest';
import { approachMist, mistLevelOf, parseMistLevel } from './mist';

describe('mist', () => {
  it('三段對應 1 / 0.5 / 0（裁決 R-03）', () => {
    expect(mistLevelOf('dense')).toBe(1);
    expect(mistLevelOf('light')).toBe(0.5);
    expect(mistLevelOf('clear')).toBe(0);
  });

  it('parseMistLevel 限制範圍並拒絕非數值', () => {
    expect(parseMistLevel('0.3')).toBe(0.3);
    expect(parseMistLevel('5')).toBe(1);
    expect(parseMistLevel(-2)).toBe(0);
    expect(parseMistLevel('abc')).toBeNull();
    expect(parseMistLevel(null)).toBeNull();
    expect(parseMistLevel('')).toBeNull();
  });

  it('approachMist 單調逼近並最終抵達目標，與分段方式無關', () => {
    let a = 0;
    for (let i = 0; i < 10; i++) a = approachMist(a, 1, 3, 0.1);
    const b = approachMist(0, 1, 3, 1);
    expect(a).toBeCloseTo(b, 6);
    expect(a).toBeLessThan(1);
    let c = 0;
    for (let i = 0; i < 200; i++) c = approachMist(c, 1, 3, 0.1);
    expect(c).toBe(1);
  });
});
