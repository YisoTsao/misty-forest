// 世界物件的查詢介面與「目前可否互動」判斷。指令規則在 authority/rules.ts。
import type { ObjectRuntime, Placement, Prefab } from './types';

export type ObjectRuntimeMap = ReadonlyMap<string, ObjectRuntime>;

export type WorldLookup = {
  placement: (id: string) => Placement | undefined;
  prefab: (id: string) => Prefab | undefined;
};

/** 這個版本已實作規則的互動類型。其他類型（建造等）於後續階段加入。 */
const implemented = new Set<Prefab['interaction']>(['open', 'harvest', 'repair', 'enter', 'read', 'activate', 'turn', 'push']);

/**
 * 物件目前是否可以互動（決定是否顯示提示）。
 * isQuestActive 判斷限定任務的互動（木橋只在修復任務進行中可修；水渠的機關只在水渠任務進行中可動）。
 */
export function canInteract(prefab: Prefab, runtime: ObjectRuntime | undefined, isQuestActive: (questId: string) => boolean = () => false): boolean {
  if (!prefab.interaction || !implemented.has(prefab.interaction)) return false;
  // 啟動後消失的物件（苔冠空地入口的樹根退開後）不再能互動
  if (prefab.activate && !prefab.activate.model && runtime?.active) return false;
  if (prefab.interaction === 'open') return runtime?.open !== true;
  if (prefab.interaction === 'harvest') return runtime?.harvested !== true && (!prefab.harvest?.quest || isQuestActive(prefab.harvest.quest));
  if (prefab.interaction === 'repair') return runtime?.repaired !== true && (!prefab.repair?.quest || isQuestActive(prefab.repair.quest));
  // 開始任務的物件（腳印）在任務可接取時由規則判斷，這裡先讓它可以互動
  // 已點亮的傳送點：再互動是打開傳送選單
  if (prefab.waypoint && runtime?.active) return true;
  if (prefab.interaction === 'activate') return runtime?.active !== true && (!prefab.activate?.quest || isQuestActive(prefab.activate.quest));
  // 推到底的石塊不能再推
  if (prefab.interaction === 'push') return (runtime?.turn ?? 0) < (prefab.push?.track.length ?? 1) - 1;
  return true;
}

/** 可推動石塊目前的位置（世界座標 x、z；第 step 格） */
export function pushPosition(prefab: Prefab, placement: Placement, step: number): { x: number; z: number } {
  const track = prefab.push?.track ?? [[0, 0]];
  const [dx, dz] = track[Math.max(0, Math.min(track.length - 1, step))]!;
  return { x: placement.position[0] + dx, z: placement.position[2] + dz };
}
