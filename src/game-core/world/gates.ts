// 地圖出入口（任務 8A，Bible §3.2）：通過條件與抵達位置。純函式。
import type { QuestRecord } from '../quest/quest';
import type { Placement, Prefab } from './types';

type Enter = NonNullable<Prefab['enter']>;

/** 出入口目前能不能通過（沒有條件的一律可以） */
export function isGateOpen(enter: Enter, quests: Readonly<Record<string, QuestRecord>>): boolean {
  const need = enter.requires?.questCompleted;
  return need === undefined || quests[need]?.status === 'completed';
}

/** 抵達位置：對面出入口前方 distance 公尺，面向離開出入口的方向（與室內的門口相同算法） */
export function arrivalAt(gate: Placement, distance: number): { x: number; z: number; yaw: number } {
  const yaw = gate.rotation?.[1] ?? 0;
  return { x: gate.position[0] + Math.sin(yaw) * distance, z: gate.position[2] + Math.cos(yaw) * distance, yaw };
}
