import { describe, expect, it } from 'vitest';
import { JOYSTICK_DEADZONE, JOYSTICK_RADIUS, joystickKnob, joystickMove, PINCH_STEP, pinchZoom, touchCode, touchLook, TOUCH_LOOK_SCALE } from './touch';

describe('虛擬搖桿', () => {
  it('中心附近不動；往上推是往前、往右推是往右', () => {
    expect(joystickMove(0, 0)).toEqual({ right: 0, forward: 0, run: false });
    expect(joystickMove(JOYSTICK_RADIUS * JOYSTICK_DEADZONE * 0.9, 0)).toEqual({ right: 0, forward: 0, run: false });
    const up = joystickMove(0, -JOYSTICK_RADIUS * 0.6);
    expect(up.forward).toBeGreaterThan(0.4);
    expect(up.right).toBeCloseTo(0);
    expect(up.run).toBe(false);
    const right = joystickMove(JOYSTICK_RADIUS * 0.6, 0);
    expect(right.right).toBeGreaterThan(0.4);
    expect(right.forward).toBeCloseTo(0);
  });

  it('推到外圈就跑步；拖超過半徑仍是推到底（長度 1）', () => {
    const far = joystickMove(0, -JOYSTICK_RADIUS * 3);
    expect(far.run).toBe(true);
    expect(far.forward).toBeCloseTo(1);
    const diagonal = joystickMove(JOYSTICK_RADIUS * 2, JOYSTICK_RADIUS * 2);
    expect(Math.hypot(diagonal.right, diagonal.forward)).toBeCloseTo(1);
    expect(diagonal.forward).toBeLessThan(0);
  });

  it('輕推慢走：強度隨距離連續變大', () => {
    const a = joystickMove(0, -JOYSTICK_RADIUS * 0.3).forward;
    const b = joystickMove(0, -JOYSTICK_RADIUS * 0.7).forward;
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
  });

  it('搖桿頭停在外圈', () => {
    expect(joystickKnob(10, 0)).toEqual({ x: 10, y: 0 });
    const k = joystickKnob(0, -JOYSTICK_RADIUS * 4);
    expect(k.x).toBeCloseTo(0);
    expect(k.y).toBeCloseTo(-JOYSTICK_RADIUS);
  });
});

describe('拖曳視角與雙指縮放', () => {
  it('拖曳依比例換成滑鼠像素', () => {
    expect(touchLook(10, -5)).toEqual({ dx: 10 * TOUCH_LOOK_SCALE, dy: -5 * TOUCH_LOOK_SCALE });
  });

  it('雙指張開拉近（負數）、捏合拉遠；不足一格的累積下次再用', () => {
    expect(pinchZoom(100, 100 + PINCH_STEP * 2).steps).toBe(-2);
    expect(pinchZoom(100 + PINCH_STEP, 100).steps).toBe(1);
    const half = pinchZoom(100, 100 - PINCH_STEP / 2);
    expect(half.steps).toBe(0);
    expect(pinchZoom(100, 100 - PINCH_STEP / 2, half.carry).steps).toBe(1);
  });

  it('觸控按鈕的按鍵代碼', () => {
    expect(touchCode('inventory')).toBe('Touch:inventory');
  });
});
