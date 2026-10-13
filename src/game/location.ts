// 目前所在的場景：開放世界或某個室內子場景（本機暫態，不存檔：在室內存檔時記錄的是門口的位置）。
import { create } from 'zustand';
import { interiorAt, OVERWORLD, type InteriorDef } from '@/game-core/world/interiors';
import { interiors, worldIndex } from './authority';
import { cameraRuntime, playerRuntime } from './player/localRuntime';

type LocationState = {
  location: string;
  /** 轉場：黑幕淡入（out）→ 移動 → 淡出（in） */
  fade: 'none' | 'out' | 'in';
};

export const useLocationStore = create<LocationState>(() => ({ location: OVERWORLD, fade: 'none' }));

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

/** 新遊戲 / 讀檔：一律從開放世界開始 */
export function resetLocation(): void {
  useLocationStore.setState({ location: OVERWORLD, fade: 'none' });
  outdoorDistance = null;
}
