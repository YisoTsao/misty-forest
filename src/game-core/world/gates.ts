// 地圖出入口（任務 8A，Bible §3.2）：通過條件與抵達位置。純函式。
import type { QuestRecord } from '../quest/quest';
import { clockAt, inTimeRange } from './timeOfDay';
import type { Placement, Prefab } from './types';

type Enter = NonNullable<Prefab['enter']>;

/** 夜裡（任務 7M：地窖只有夜裡燈塔亮著時打得開）：19 點到隔天 5 點 */
export const NIGHT = { from: 19, to: 5 } as const;

/** 出入口目前能不能通過（沒有條件的一律可以）；time 為遊戲時間（夜裡的條件用） */
export function isGateOpen(enter: Enter, quests: Readonly<Record<string, QuestRecord>>, time = 0): boolean {
  const r = enter.requires;
  if (!r) return true;
  if (r.questCompleted && quests[r.questCompleted]?.status !== 'completed') return false;
  if (r.questActive && quests[r.questActive]?.status !== 'active') return false;
  if (r.night && !inTimeRange(clockAt(time), NIGHT.from, NIGHT.to)) return false;
  return true;
}

/** 抵達位置：對面出入口前方 distance 公尺，面向離開出入口的方向（與室內的門口相同算法） */
export function arrivalAt(gate: Placement, distance: number): { x: number; z: number; yaw: number } {
  const yaw = gate.rotation?.[1] ?? 0;
  return { x: gate.position[0] + Math.sin(yaw) * distance, z: gate.position[2] + Math.cos(yaw) * distance, yaw };
}
