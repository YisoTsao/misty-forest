import { useFrame } from '@react-three/fiber';
import { useRapier, type RapierCollider } from '@react-three/rapier';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { input } from '@/game/input/inputManager';
import { cameraRuntime, playerRuntime } from '@/game/player/localRuntime';
import { useGameStore } from '@/game/state/gameStore';

const SENSITIVITY = 0.0025; // 弧度 / 像素
const PITCH_MIN = -0.15;
const PITCH_MAX = 1.2;
const DIST_MIN = 2.5;
const DIST_MAX = 12;
const ZOOM_STEP = 0.8;
/** 視線樞紐：膠囊中心往上（約在角色頭部） */
const PIVOT_OFFSET_Y = 0.55;
/** 攝影機碰撞球半徑，避免近平面切進牆裡 */
const PROBE_RADIUS = 0.25;
const MIN_ALLOWED = 0.6;

const identityRot = { x: 0, y: 0, z: 0, w: 1 };

/**
 * 第三人稱跟隨攝影機（規格 6.1）：
 * 滑鼠旋轉、滾輪縮放、限制垂直角度、平滑跟隨，
 * 並由樞紐往攝影機方向做 shape cast，被擋住時立即拉近、解除後平滑退回。
 */
export function FollowCamera({ playerCollider }: { playerCollider: RefObject<RapierCollider | null> }) {
  const { world, rapier } = useRapier();
  const probe = useMemo(() => new rapier.Ball(PROBE_RADIUS), [rapier]);
  const pivot = useRef(new THREE.Vector3());
  const smoothPivot = useRef<THREE.Vector3 | null>(null);
  const currentDist = useRef(cameraRuntime.distance);
  const dir = useMemo(() => new THREE.Vector3(), []);

  // 只有遊玩中允許鎖定滑鼠；暫停選單需要一般游標
  const playing = useGameStore((s) => s.screen === 'playing');
  useEffect(() => {
    input.setPointerLockEnabled(playing);
    return () => input.setPointerLockEnabled(false);
  }, [playing]);

  useFrame(({ camera }, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);

    const look = input.consumeLook();
    cameraRuntime.yaw -= look.dx * SENSITIVITY;
    cameraRuntime.pitch = THREE.MathUtils.clamp(cameraRuntime.pitch + look.dy * SENSITIVITY, PITCH_MIN, PITCH_MAX);
    cameraRuntime.distance = THREE.MathUtils.clamp(cameraRuntime.distance + input.consumeZoom() * ZOOM_STEP, DIST_MIN, DIST_MAX);

    const p = playerRuntime.position;
    pivot.current.set(p.x, p.y + PIVOT_OFFSET_Y, p.z);
    if (!smoothPivot.current) smoothPivot.current = pivot.current.clone();
    // 樞紐平滑跟隨；距離過大（例如重生傳送）直接跳過去
    if (smoothPivot.current.distanceToSquared(pivot.current) > 25) smoothPivot.current.copy(pivot.current);
    else smoothPivot.current.lerp(pivot.current, 1 - Math.exp(-14 * dt));
    const sp = smoothPivot.current;

    const { yaw, pitch, distance } = cameraRuntime;
    dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));

    let allowed = distance;
    // dir 為單位向量，time_of_impact 即沿線距離；targetDistance 0 表示接觸即算命中
    const hit = world.castShape(sp, identityRot, dir, probe, 0, distance, true, undefined, undefined, playerCollider.current ?? undefined);
    if (hit) allowed = Math.max(MIN_ALLOWED, hit.time_of_impact - 0.05);

    // 被擋：立刻拉近；解除：平滑退回
    currentDist.current =
      allowed < currentDist.current ? allowed : THREE.MathUtils.lerp(currentDist.current, allowed, 1 - Math.exp(-5 * dt));

    camera.position.copy(sp).addScaledVector(dir, currentDist.current);
    camera.lookAt(sp);
    Object.assign(cameraRuntime.position, { x: camera.position.x, y: camera.position.y, z: camera.position.z });
  });

  return null;
}
