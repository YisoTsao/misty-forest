// 目前所在的場景：開放世界或某個室內子場景（本機暫態，不存檔：在室內存檔時記錄的是門口的位置），
// 以及所在的地圖（任務 8A；由玩家位置決定，位置本來就存檔）。
import { create } from 'zustand';
import { arrivalAt } from '@/game-core/world/gates';
import { interiorAt, OVERWORLD, type InteriorDef } from '@/game-core/world/interiors';
import { mapIdAt, type MapId } from '@/game-core/world/maps';
import { createSafePointTrail } from '@/game-core/world/safePoints';
import { terrainHeight } from '@/game-core/world/terrain';
import type { Prefab } from '@/game-core/world/types';
import { interiors, worldIndex } from './authority';
import { cameraRuntime, playerRuntime } from './player/localRuntime';
import { worldDataResult } from './worldData';

type LocationState = {
  location: string;
  /** 所在的地圖（顯示哪張地圖的地形、天空遠景、小地圖） */
  map: MapId;
  /** 轉場：黑幕淡入（out）→ 移動 → 淡出（in） */
  fade: 'none' | 'out' | 'in';
};

export const useLocationStore = create<LocationState>(() => ({ location: OVERWORLD, map: 'dawnvale', fade: 'none' }));

export function currentMap(): MapId {
  return useLocationStore.getState().map;
}

/** 依觀看位置更新所在地圖（讀檔、除錯傳送後由 MapTracker 呼叫；地圖切換時 travelToMap 直接設定） */
export function syncMapTo(x: number, z: number): void {
  // 室內子場景屬於晨曦谷地（mapIdAt 已處理）；轉場中不改，避免黑幕前一瞬間換景
  if (useLocationStore.getState().fade !== 'none') return;
  const map = mapIdAt(x, z);
  if (map !== useLocationStore.getState().map) useLocationStore.setState({ map });
}

/** 轉場黑幕淡入的時間（毫秒） */
export const FADE_MS = 350;

/** 開放世界中室內入口前方的位置與面向（背對建築） */
export function doorstep(interior: InteriorDef): { x: number; z: number; yaw: number } {
  const door = worldIndex.placement(interior.door);
  if (!door) throw new Error(`找不到入口 ${interior.door}`);
  const yaw = door.rotation?.[1] ?? 0;
  return { x: door.position[0] + Math.sin(yaw) * interior.outsideDistance, z: door.position[2] + Math.cos(yaw) * interior.outsideDistance, yaw };
}

/** 玩家目前所在的室內（依位置判斷，與 location 一致） */
export function currentInterior(): InteriorDef | null {
  return interiorAt(interiors, playerRuntime.position.x, playerRuntime.position.z);
}

/** 存檔用的位置：在室內時記錄門口（讀檔後從門口開始，規格：子場景不與開放世界混用） */
export function savePosition(): { position: { x: number; y: number; z: number }; facingYaw: number } | null {
  const inside = currentInterior();
  if (!inside) return null;
  const out = doorstep(inside);
  return { position: { x: out.x, y: playerRuntime.position.y, z: out.z }, facingYaw: out.yaw };
}

/** 室內的攝影機：房間小，拉近並從較高處往下看，避免一進門就被牆擋住 */
const INDOOR_CAMERA = { pitch: 0.5, distance: 4.2 };
/** 進門前的攝影機距離，出門時還原 */
let outdoorDistance: number | null = null;

function place(x: number, z: number, yaw: number, camera: { pitch: number; distance: number }, feetY?: number): void {
  playerRuntime.teleportRequest = { x, z, feetY };
  playerRuntime.locomotion.facingYaw = yaw;
  playerRuntime.locomotion.vx = playerRuntime.locomotion.vz = 0;
  // 攝影機放在角色背後
  Object.assign(cameraRuntime, { yaw: yaw - Math.PI, ...camera });
}

/** 走進 / 走出建築：黑幕淡入 → 移動 → 淡出 */
export function travel(to: string): void {
  const state = useLocationStore.getState();
  if (state.fade !== 'none') return;
  useLocationStore.setState({ fade: 'out' });
  window.setTimeout(() => {
    if (to === OVERWORLD) {
      const inside = currentInterior();
      if (inside) {
        const out = doorstep(inside);
        place(out.x, out.z, out.yaw, { pitch: 0.32, distance: outdoorDistance ?? 6 });
        outdoorDistance = null;
      }
    } else {
      const target = interiors.get(to);
      if (target) {
        outdoorDistance ??= cameraRuntime.distance;
        place(target.inside[0], target.inside[1], target.inside[2], INDOOR_CAMERA, 0.02);
      }
    }
    useLocationStore.setState({ location: to, fade: 'in' });
    window.setTimeout(() => useLocationStore.setState({ fade: 'none' }), FADE_MS);
  }, FADE_MS);
}

/**
 * 走過地圖出入口（任務 8A）：黑幕淡入 → 傳送到對面出入口前方 → 淡出。
 * 本機轉場（位置是本機狀態，同室內）；安全點換成新地圖的抵達點，掉落時不會被拉回原本的地圖。
 */
export function travelToMap(map: MapId, arriveAt: string, arriveDistance: number): void {
  const state = useLocationStore.getState();
  if (state.fade !== 'none') return;
  const gate = worldIndex.placement(arriveAt);
  if (!gate) throw new Error(`找不到地圖出入口 ${arriveAt}`);
  const to = arrivalAt(gate, arriveDistance);
  useLocationStore.setState({ fade: 'out' });
  window.setTimeout(() => {
    place(to.x, to.z, to.yaw, { pitch: 0.32, distance: cameraRuntime.distance });
    playerRuntime.safePoints = createSafePointTrail({ x: to.x, y: terrainHeight(to.x, to.z) + 0.9, z: to.z });
    useLocationStore.setState({ map, fade: 'in' });
    window.setTimeout(() => useLocationStore.setState({ fade: 'none' }), FADE_MS);
  }, FADE_MS);
}

/** 通往某張地圖的出入口設定（除錯與測試用） */
export function mapGateTo(map: MapId): NonNullable<Prefab['enter']> | null {
  if (!worldDataResult.ok) return null;
  for (const prefab of worldDataResult.data.prefabs.values()) if (prefab.enter?.to === map) return prefab.enter;
  return null;
}

/** 新遊戲 / 讀檔：一律從開放世界開始（所在地圖由玩家位置決定） */
export function resetLocation(): void {
  useLocationStore.setState({ location: OVERWORLD, fade: 'none', map: mapIdAt(playerRuntime.position.x, playerRuntime.position.z) });
  outdoorDistance = null;
}
