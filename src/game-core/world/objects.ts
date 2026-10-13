// 世界物件的查詢介面與「目前可否互動」判斷。指令規則在 authority/rules.ts。
import type { ObjectRuntime, Placement, Prefab } from './types';

export type ObjectRuntimeMap = ReadonlyMap<string, ObjectRuntime>;

export type WorldLookup = {
  placement: (id: string) => Placement | undefined;
  prefab: (id: string) => Prefab | undefined;
};

/** 這個版本已實作規則的互動類型。其他類型（對話、建造等）於後續階段加入。 */
const implemented = new Set<Prefab['interaction']>(['open', 'harvest']);

/** 物件目前是否可以互動（決定是否顯示提示）。 */
export function canInteract(prefab: Prefab, runtime: ObjectRuntime | undefined): boolean {
  if (!prefab.interaction || !implemented.has(prefab.interaction)) return false;
  if (prefab.interaction === 'open') return runtime?.open !== true;
  if (prefab.interaction === 'harvest') return runtime?.harvested !== true;
  return true;
}
