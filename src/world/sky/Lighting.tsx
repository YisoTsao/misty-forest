import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { approachMist } from '@/game-core/world/mist';
import { playerRuntime } from '@/game/player/localRuntime';
import { useDebugStore } from '@/game/state/debugStore';
import { currentScreen } from '@/game/state/gameStore';
import { currentInterior, currentMap } from '@/game/location';
import { mistTargetAt } from '@/game/world/mistTarget';
import { timeRuntime } from '@/game/world/timeRuntime';
import { useQualityPreset } from '@/game/state/settingsStore';
import { createMistLook, mistLook, uMist } from '@/render/mist';
import { fogRange, palette } from '@/render/palette';
import { tintTimeLookForMap, updateTimeLook } from '@/render/timeLook';

/** 迷霧變化速度：約 1 秒完成大部分轉換，避免突兀跳變 */
const MIST_RATE = 3;
/** 主光距離焦點的距離；方向依日夜（GAME_DESIGN 5.2）由太陽或月亮決定 */
const SUN_DISTANCE = 90;
/** 室內不受日夜影響：固定使用正午的外觀與光線方向 */
const INTERIOR_HOUR = 12;
const INTERIOR_DIRECTION = new THREE.Vector3(40, 60, 25).normalize();
/** 陰影範圍半寬（公尺）：只涵蓋攝影機前方一塊區域，解析度集中在近景 */
const SHADOW_HALF = 38;
/** 陰影焦點放在攝影機前方，讓畫面中央附近的陰影最清楚 */
const FOCUS_AHEAD = 22;

/**
 * 一盞方向光 + 半球光 + 深度霧（規格 4.2、4.3），並依 uMist 插值成迷霧外觀（規格 4.5）。
 * 日夜（GAME_DESIGN 5.2）：先依時鐘算出時段外觀，再疊上迷霧；方向光白天跟太陽、夜晚跟月亮（仍只有一盞投影光）。
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
  const lightDir = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const light = sun.current;
    if (!light) return;
    light.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
    // 解析度改變後需重建陰影貼圖
    light.shadow.map?.dispose();
    light.shadow.map = null;
  }, [preset.shadowMapSize]);

  useFrame(({ camera }, dt) => {
    const { mistSnap, cameraMode } = useDebugStore.getState();
    // 遊玩中依玩家位置；主選單與自由視角依攝影機位置
    const viewer = cameraMode === 'follow' && currentScreen() !== 'title' ? playerRuntime.position : camera.position;
    const mistTarget = mistTargetAt(viewer.x, viewer.z);
    if (mistSnap !== lastSnap.current) {
      lastSnap.current = mistSnap;
      uMist.value = mistTarget;
    }
    uMist.value = approachMist(uMist.value, mistTarget, MIST_RATE, Math.min(dt, 0.1));
    const indoors = currentInterior() !== null;
    timeRuntime.lookHour = indoors ? INTERIOR_HOUR : timeRuntime.hour;
    updateTimeLook(timeRuntime.lookHour);
    if (!indoors) tintTimeLookForMap(currentMap());
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
      timeRuntime.lightIntensity = look.sunIntensity;
      // 陰影相機跟隨攝影機前方的焦點；焦點對齊陰影貼圖的像素格，移動時陰影邊緣不會閃爍
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      focus.copy(camera.position).addScaledVector(forward, FOCUS_AHEAD);
      const texel = (SHADOW_HALF * 2) / light.shadow.mapSize.x;
      focus.set(Math.round(focus.x / texel) * texel, 0, Math.round(focus.z / texel) * texel);
      if (indoors) lightDir.copy(INTERIOR_DIRECTION);
      else lightDir.set(timeRuntime.lightDir.x, timeRuntime.lightDir.y, timeRuntime.lightDir.z);
      light.position.copy(focus).addScaledVector(lightDir, SUN_DISTANCE);
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
