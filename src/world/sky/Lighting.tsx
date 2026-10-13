import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { approachMist } from '@/game-core/world/mist';
import { useDebugStore } from '@/game/state/debugStore';
import { useQualityPreset } from '@/game/state/settingsStore';
import { createMistLook, mistLook, uMist } from '@/render/mist';
import { fogRange, palette } from '@/render/palette';

/** 迷霧變化速度：約 1 秒完成大部分轉換，避免突兀跳變 */
const MIST_RATE = 3;
/** 主光方向（由焦點指向太陽） */
const SUN_DIRECTION = new THREE.Vector3(40, 60, 25).normalize();
const SUN_DISTANCE = 90;
/** 陰影範圍半寬（公尺）：只涵蓋攝影機前方一塊區域，解析度集中在近景 */
const SHADOW_HALF = 38;
/** 陰影焦點放在攝影機前方，讓畫面中央附近的陰影最清楚 */
const FOCUS_AHEAD = 22;

/**
 * 一盞方向光 + 半球光 + 深度霧（規格 4.2、4.3），並依 uMist 插值成迷霧外觀（規格 4.5）。
 * 這裡同時負責把 uMist 往目標值推進；外觀參數只寫入 three 物件，不經過 React state。
 */
export function Lighting() {
  const fog = useRef<THREE.Fog>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const look = useMemo(() => createMistLook(), []);
  const lastSnap = useRef(0);
  const preset = useQualityPreset();
  const focus = useMemo(() => new THREE.Vector3(), []);
  const forward = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const light = sun.current;
    if (!light) return;
    light.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
    // 解析度改變後需重建陰影貼圖
    light.shadow.map?.dispose();
    light.shadow.map = null;
  }, [preset.shadowMapSize]);

  useFrame(({ camera }, dt) => {
    const { mistTarget, mistSnap } = useDebugStore.getState();
    if (mistSnap !== lastSnap.current) {
      lastSnap.current = mistSnap;
      uMist.value = mistTarget;
    }
    uMist.value = approachMist(uMist.value, mistTarget, MIST_RATE, Math.min(dt, 0.1));
    mistLook(uMist.value, look);
    if (fog.current) {
      fog.current.color.copy(look.fogColor);
      fog.current.near = look.fogNear;
      fog.current.far = look.fogFar;
    }
    if (hemi.current) {
      hemi.current.color.copy(look.hemiSky);
      hemi.current.groundColor.copy(look.hemiGround);
      hemi.current.intensity = look.hemiIntensity;
    }
    if (sun.current) {
      const light = sun.current;
      light.color.copy(look.sunColor);
      light.intensity = look.sunIntensity;
      // 陰影相機跟隨攝影機前方的焦點；焦點對齊陰影貼圖的像素格，移動時陰影邊緣不會閃爍
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      focus.copy(camera.position).addScaledVector(forward, FOCUS_AHEAD);
      const texel = (SHADOW_HALF * 2) / light.shadow.mapSize.x;
      focus.set(Math.round(focus.x / texel) * texel, 0, Math.round(focus.z / texel) * texel);
      light.position.copy(focus).addScaledVector(SUN_DIRECTION, SUN_DISTANCE);
      light.target.position.copy(focus);
      light.target.updateMatrixWorld();
    }
  });

  return (
    <>
      <fog ref={fog} attach="fog" args={[palette.skyHorizon, fogRange.near, fogRange.far]} />
      <hemisphereLight ref={hemi} args={[palette.hemiSky, palette.hemiGround, 1.4]} />
      <directionalLight
        ref={sun}
        position={[40, 60, 25]}
        intensity={2.4}
        color={palette.sun}
        castShadow
        shadow-bias={-0.0008}
        shadow-normalBias={0.09}
        shadow-camera-left={-SHADOW_HALF}
        shadow-camera-right={SHADOW_HALF}
        shadow-camera-top={SHADOW_HALF}
        shadow-camera-bottom={-SHADOW_HALF}
        shadow-camera-near={10}
        shadow-camera-far={180}
      />
    </>
  );
}
