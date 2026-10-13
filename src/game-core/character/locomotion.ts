// 角色移動與動畫狀態的純邏輯（規格 5.2、5.3 / 6.1）。
// 物理碰撞由渲染層的角色控制器處理；這裡只決定「想移動多少」與「該播什麼動畫」。
import type { LocomotionAnim, LocomotionParams } from './characterDef';

export type LocomotionInput = {
  /** 右為正，[-1, 1] */
  right: number;
  /** 前為正，[-1, 1] */
  forward: number;
  run: boolean;
  /** 本幀是否剛按下跳躍（邊緣觸發） */
  jumpPressed: boolean;
};

export type LocomotionState = {
  vx: number;
  vy: number;
  vz: number;
  /** 角色面向（繞 Y 軸，0 = 面向 +Z） */
  facingYaw: number;
  grounded: boolean;
  airTime: number;
  landTimer: number;
  jumping: boolean;
  anim: LocomotionAnim;
};

export function initialLocomotionState(facingYaw = 0): LocomotionState {
  return { vx: 0, vy: 0, vz: 0, facingYaw, grounded: true, airTime: 0, landTimer: 0, jumping: false, anim: 'idle' };
}

/**
 * 把輸入軸依攝影機水平朝向轉成世界方向。
 * cameraYaw：攝影機繞角色的角度，0 表示攝影機在角色 +Z 側、看向 -Z。
 * 回傳向量長度 ≤ 1，斜向不會比直線快。
 */
export function moveInputToWorld(right: number, forward: number, cameraYaw: number): { x: number; z: number } {
  const sin = Math.sin(cameraYaw);
  const cos = Math.cos(cameraYaw);
  let x = right * cos - forward * sin;
  let z = -right * sin - forward * cos;
  const len = Math.hypot(x, z);
  if (len > 1) {
    x /= len;
    z /= len;
  }
  return { x, z };
}

/** 水平速度往目標逼近；無輸入時用較大的減速度，避免停止後滑行。 */
export function approachVelocity(
  vx: number,
  vz: number,
  targetX: number,
  targetZ: number,
  accel: number,
  decel: number,
  dt: number,
): { x: number; z: number } {
  const dx = targetX - vx;
  const dz = targetZ - vz;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-6) return { x: targetX, z: targetZ };
  const stopping = Math.hypot(targetX, targetZ) < 1e-6;
  const maxStep = (stopping ? decel : accel) * dt;
  if (dist <= maxStep) return { x: targetX, z: targetZ };
  return { x: vx + (dx / dist) * maxStep, z: vz + (dz / dist) * maxStep };
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function rotateToward(current: number, target: number, maxStep: number): number {
  const diff = wrapAngle(target - current);
  return Math.abs(diff) <= maxStep ? target : current + Math.sign(diff) * maxStep;
}

const MOVING_EPSILON = 0.2;
/** 被地面壓住時的微小下壓速度，讓控制器持續貼地。 */
const GROUND_STICK_VELOCITY = -2;

export function groundAnim(speed: number, landTimer: number, p: LocomotionParams): LocomotionAnim {
  if (speed < MOVING_EPSILON) return landTimer > 0 ? 'land' : 'idle';
  return speed > (p.walkSpeed + p.runSpeed) / 2 ? 'run' : 'walk';
}

/**
 * 推進一個時間步。
 * @param grounded 物理控制器上一步回報的接地結果
 * @returns 新狀態，以及本步希望的位移（交給角色控制器做碰撞修正）
 */
export function stepLocomotion(
  prev: LocomotionState,
  input: LocomotionInput,
  cameraYaw: number,
  grounded: boolean,
  p: LocomotionParams,
  dt: number,
): { state: LocomotionState; delta: { x: number; y: number; z: number } } {
  const s: LocomotionState = { ...prev, grounded };

  // 接地 / 空中計時與落地判定
  if (grounded) {
    if (!prev.grounded && prev.airTime > p.fallDelay) s.landTimer = p.landDuration;
    s.airTime = 0;
    if (s.vy <= 0) s.jumping = false;
  } else {
    s.airTime = prev.airTime + dt;
  }
  s.landTimer = Math.max(0, s.landTimer - (grounded && prev.grounded ? dt : 0));

  // 跳躍：接地或 coyote time 內，且不在跳躍上升中
  const canJump = (grounded || s.airTime <= p.coyoteTime) && !s.jumping;
  if (input.jumpPressed && canJump) {
    s.vy = p.jumpVelocity;
    s.jumping = true;
    s.landTimer = 0;
  }

  // 垂直速度
  s.vy -= p.gravity * dt;
  if (grounded && !s.jumping && s.vy < GROUND_STICK_VELOCITY) s.vy = GROUND_STICK_VELOCITY;

  // 水平速度
  const dir = moveInputToWorld(input.right, input.forward, cameraYaw);
  const speed = input.run ? p.runSpeed : p.walkSpeed;
  const v = approachVelocity(s.vx, s.vz, dir.x * speed, dir.z * speed, p.acceleration, p.deceleration, dt);
  s.vx = v.x;
  s.vz = v.z;

  // 面向主要移動方向
  const horizontalSpeed = Math.hypot(s.vx, s.vz);
  if (horizontalSpeed > MOVING_EPSILON) {
    s.facingYaw = rotateToward(prev.facingYaw, Math.atan2(s.vx, s.vz), p.turnSpeed * dt);
  }

  // 動畫狀態：依實際狀態，不會同時播走路與待機
  if (s.jumping && s.vy > 0) s.anim = 'jump';
  else if (!grounded && (s.jumping || s.airTime > p.fallDelay)) s.anim = 'fall';
  else s.anim = groundAnim(horizontalSpeed, s.landTimer, p);

  return { state: s, delta: { x: s.vx * dt, y: s.vy * dt, z: s.vz * dt } };
}
