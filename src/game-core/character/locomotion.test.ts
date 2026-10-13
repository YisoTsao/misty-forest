import { describe, expect, it } from 'vitest';
import type { LocomotionParams } from './characterDef';
import {
  initialLocomotionState,
  moveInputToWorld,
  stepLocomotion,
  type LocomotionInput,
  type LocomotionState,
} from './locomotion';

const p: LocomotionParams = {
  walkSpeed: 3,
  runSpeed: 6,
  acceleration: 28,
  deceleration: 42,
  turnSpeed: 12,
  jumpVelocity: 7,
  gravity: 22,
  coyoteTime: 0.12,
  fallDelay: 0.18,
  landDuration: 0.3,
};
const dt = 1 / 60;
const none: LocomotionInput = { right: 0, forward: 0, run: false, jumpPressed: false };

/** 以固定接地狀態模擬多步。 */
function simulate(state: LocomotionState, input: LocomotionInput, steps: number, grounded = true, yaw = 0) {
  let s = state;
  for (let i = 0; i < steps; i++) s = stepLocomotion(s, input, yaw, grounded, p, dt).state;
  return s;
}

const speed = (s: LocomotionState) => Math.hypot(s.vx, s.vz);

describe('moveInputToWorld', () => {
  it('攝影機在 +Z 側時，前進為 -Z、右為 +X', () => {
    const f = moveInputToWorld(0, 1, 0);
    expect(f.x).toBeCloseTo(0);
    expect(f.z).toBeCloseTo(-1);
    const r = moveInputToWorld(1, 0, 0);
    expect(r.x).toBeCloseTo(1);
    expect(r.z).toBeCloseTo(0);
  });

  it('前進方向隨攝影機水平朝向旋轉', () => {
    const f = moveInputToWorld(0, 1, Math.PI / 2); // 攝影機在 +X 側
    expect(f.x).toBeCloseTo(-1);
    expect(f.z).toBeCloseTo(0);
  });

  it('斜向輸入長度不超過 1', () => {
    const d = moveInputToWorld(1, 1, 0.7);
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(1);
  });
});

describe('stepLocomotion：水平移動', () => {
  it('斜向最高速不比直線快', () => {
    const straight = simulate(initialLocomotionState(), { ...none, forward: 1 }, 120);
    const diagonal = simulate(initialLocomotionState(), { ...none, forward: 1, right: 1 }, 120);
    expect(speed(diagonal)).toBeCloseTo(speed(straight), 5);
    expect(speed(straight)).toBeCloseTo(p.walkSpeed, 5);
  });

  it('跑步速度為 runSpeed', () => {
    expect(speed(simulate(initialLocomotionState(), { ...none, forward: 1, run: true }, 120))).toBeCloseTo(p.runSpeed, 5);
  });

  it('放開按鍵後在 0.2 秒內停下並切回 idle（不滑行）', () => {
    const running = simulate(initialLocomotionState(), { ...none, forward: 1, run: true }, 120);
    expect(running.anim).toBe('run');
    const stopped = simulate(running, none, Math.ceil(0.2 / dt));
    expect(speed(stopped)).toBe(0);
    expect(stopped.anim).toBe('idle');
  });

  it('角色轉向移動方向', () => {
    const s = simulate(initialLocomotionState(0), { ...none, right: 1 }, 60);
    expect(s.facingYaw).toBeCloseTo(Math.PI / 2, 3);
  });

  it('動畫依速度切換 idle / walk / run', () => {
    expect(simulate(initialLocomotionState(), none, 10).anim).toBe('idle');
    expect(simulate(initialLocomotionState(), { ...none, forward: 1 }, 60).anim).toBe('walk');
    expect(simulate(initialLocomotionState(), { ...none, forward: 1, run: true }, 60).anim).toBe('run');
  });
});

describe('stepLocomotion：跳躍與落地', () => {
  it('接地時按跳躍會往上並播放 jump', () => {
    const { state, delta } = stepLocomotion(initialLocomotionState(), { ...none, jumpPressed: true }, 0, true, p, dt);
    expect(state.vy).toBeGreaterThan(0);
    expect(delta.y).toBeGreaterThan(0);
    expect(state.anim).toBe('jump');
  });

  it('空中超過 coyote time 不能再跳', () => {
    const falling = simulate(initialLocomotionState(), none, 20, false);
    const after = stepLocomotion(falling, { ...none, jumpPressed: true }, 0, false, p, dt).state;
    expect(after.vy).toBeLessThan(0);
    expect(after.jumping).toBe(false);
  });

  it('剛離地（coyote time 內）仍可跳', () => {
    const justLeft = simulate(initialLocomotionState(), none, 3, false);
    const after = stepLocomotion(justLeft, { ...none, jumpPressed: true }, 0, false, p, dt).state;
    expect(after.jumping).toBe(true);
  });

  it('上升中不能二段跳', () => {
    const up = stepLocomotion(initialLocomotionState(), { ...none, jumpPressed: true }, 0, true, p, dt).state;
    const again = stepLocomotion(up, { ...none, jumpPressed: true }, 0, false, p, dt).state;
    expect(again.vy).toBeLessThan(up.vy);
  });

  it('下落時播放 fall，落地後靜止播放 land 再回 idle', () => {
    const falling = simulate(initialLocomotionState(), none, 30, false);
    expect(falling.anim).toBe('fall');
    const landed = stepLocomotion(falling, none, 0, true, p, dt).state;
    expect(landed.anim).toBe('land');
    expect(simulate(landed, none, Math.ceil(p.landDuration / dt) + 1).anim).toBe('idle');
  });

  it('移動中落地直接接走路，不播 land（避免滑行）', () => {
    const fallingMoving = simulate(initialLocomotionState(), { ...none, forward: 1 }, 30, false);
    const landed = stepLocomotion(fallingMoving, { ...none, forward: 1 }, 0, true, p, dt).state;
    expect(landed.anim).toBe('walk');
  });

  it('小段離地（短於 fallDelay）不切換到 fall', () => {
    const walking = simulate(initialLocomotionState(), { ...none, forward: 1 }, 60);
    const bump = simulate(walking, { ...none, forward: 1 }, 3, false);
    expect(bump.anim).toBe('walk');
  });

  it('接地時垂直速度不會無限累積', () => {
    expect(simulate(initialLocomotionState(), none, 300).vy).toBeGreaterThanOrEqual(-2);
  });
});
