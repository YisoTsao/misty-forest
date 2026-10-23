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
  /** 本幀翻滾已經被權威層接受（冷卻與死亡由權威層判斷，這裡只負責動作） */
  roll?: boolean;
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
  /** 翻滾剩餘時間與翻滾方向（第二章 Phase 3） */
  rollTimer: number;
  rollX: number;
  rollZ: number;
};

/** 翻滾的動作時間與速度（與權威層的無敵時間 ROLL_SEC 一致） */
export const ROLL_ANIM_SEC = 0.45;
export const ROLL_SPEED = 8;

export function initialLocomotionState(facingYaw = 0): LocomotionState {
  return { vx: 0, vy: 0, vz: 0, facingYaw, grounded: true, airTime: 0, landTimer: 0, jumping: false, anim: 'idle', rollTimer: 0, rollX: 0, rollZ: 0 };
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
  const canJump = (grounded || s.airTime <= p.coyoteTime) && !s.jumping && s.rollTimer <= 0;
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
  // 翻滾（第二章 Phase 3）：沿開始時的移動方向（沒有方向就往面向的方向）滾出去，翻滾中不接受移動輸入
  if (input.roll && s.rollTimer <= 0) {
    const len = Math.hypot(dir.x, dir.z);
    s.rollX = len > 0.01 ? dir.x / len : Math.sin(prev.facingYaw);
    s.rollZ = len > 0.01 ? dir.z / len : Math.cos(prev.facingYaw);
    s.rollTimer = ROLL_ANIM_SEC;
  }
  if (s.rollTimer > 0) {
    s.vx = s.rollX * ROLL_SPEED;
    s.vz = s.rollZ * ROLL_SPEED;
    s.rollTimer = Math.max(0, s.rollTimer - dt);
  } else {
    const v = approachVelocity(s.vx, s.vz, dir.x * speed, dir.z * speed, p.acceleration, p.deceleration, dt);
    s.vx = v.x;
    s.vz = v.z;
  }

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
