// 傳送點（2026-10-25，第二章檢討方案 C：減少來回跑）：點亮的星光路標之間可以傳送。
// 純函式：哪些路標可以去、到了站在哪裡。實際的移動（黑幕、相機）在 game/location.ts。
import { mapIdAt } from './maps';
import type { ObjectRuntime, Placement, Prefab } from './types';

export type Waypoint = { id: string; x: number; z: number };

/** 傳送選單裡顯示的名稱（文字 key）：每座路標各自命名，例如「星晶祕窟入口」 */
export function waypointNameKey(id: string): string {
  return `waypoint.name.${id}`;
}

/** 抵達時站在路標前方（+Z 朝向）這麼遠的地方 */
export const WAYPOINT_ARRIVE_DISTANCE = 2.4;

/** 所有傳送點（依 placement 順序） */
export function waypoints(placements: readonly Placement[], prefab: (id: string) => Prefab | undefined): Waypoint[] {
  const out: Waypoint[] = [];
  for (const p of placements) {
    if (prefab(p.prefabId)?.waypoint) out.push({ id: p.id, x: p.position[0], z: p.position[2] });
  }
  return out;
}

/** 從 from 可以去的地方：同一張地圖、已點亮、不是自己 */
export function waypointDestinations(all: readonly Waypoint[], objects: ReadonlyMap<string, ObjectRuntime>, from: string): Waypoint[] {
  const origin = all.find((w) => w.id === from);
  if (!origin || objects.get(from)?.active !== true) return [];
  const map = mapIdAt(origin.x, origin.z);
  return all.filter((w) => w.id !== from && objects.get(w.id)?.active === true && mapIdAt(w.x, w.z) === map);
}

/** 抵達的位置與面向：路標前方 WAYPOINT_ARRIVE_DISTANCE 公尺，背對路標（面向外面） */
export function waypointArrival(placement: Placement): { x: number; z: number; yaw: number } {
  const yaw = placement.rotation?.[1] ?? 0;
  return {
    x: placement.position[0] + Math.sin(yaw) * WAYPOINT_ARRIVE_DISTANCE,
    z: placement.position[2] + Math.cos(yaw) * WAYPOINT_ARRIVE_DISTANCE,
    yaw,
  };
}
