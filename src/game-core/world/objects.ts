// 世界物件互動規則（規格 3.2：指令 → 驗證 → 事件 → 狀態）。
// 純函式：輸入目前的物件執行期狀態與指令，輸出事件；狀態只由事件推導。
// Phase 2 會把這裡接進完整的 Authority，目前先供單人本機直接呼叫。
import type { ObjectRuntime, Placement, Prefab } from './types';

export type ObjectRuntimeMap = ReadonlyMap<string, ObjectRuntime>;

export type InteractCommand = { type: 'Interact'; placementId: string };

export type WorldEvent =
  | { type: 'ChestOpened'; placementId: string }
  | { type: 'CommandRejected'; placementId: string; reason: RejectReason };

export type RejectReason = 'unknown-object' | 'not-interactable' | 'already-open' | 'not-implemented';

export type WorldLookup = {
  placement: (id: string) => Placement | undefined;
  prefab: (id: string) => Prefab | undefined;
};

/** 這個版本已實作規則的互動類型。其他類型（採集、對話等）於 Phase 2、3 加入。 */
const implemented = new Set<Prefab['interaction']>(['open']);

/** 物件目前是否可以互動（決定是否顯示提示）。 */
export function canInteract(prefab: Prefab, runtime: ObjectRuntime | undefined): boolean {
  if (!prefab.interaction || !implemented.has(prefab.interaction)) return false;
  if (prefab.interaction === 'open') return runtime?.open !== true;
  return true;
}

export function handleInteract(objects: ObjectRuntimeMap, world: WorldLookup, cmd: InteractCommand): WorldEvent[] {
  const reject = (reason: RejectReason): WorldEvent[] => [{ type: 'CommandRejected', placementId: cmd.placementId, reason }];
  const placement = world.placement(cmd.placementId);
  const prefab = placement && world.prefab(placement.prefabId);
  if (!placement || !prefab) return reject('unknown-object');
  if (!prefab.interaction) return reject('not-interactable');
  if (!implemented.has(prefab.interaction)) return reject('not-implemented');

  const runtime = objects.get(cmd.placementId);
  switch (prefab.interaction) {
    case 'open':
      // 規格 5.2：寶箱記錄開關，唯一獎勵不可重複領取
      if (runtime?.open) return reject('already-open');
      return [{ type: 'ChestOpened', placementId: cmd.placementId }];
    default:
      return reject('not-implemented');
  }
}

/** 套用事件，回傳新的狀態表（不修改輸入）。 */
export function applyWorldEvents(objects: ObjectRuntimeMap, events: readonly WorldEvent[]): Map<string, ObjectRuntime> {
  const next = new Map(objects);
  for (const e of events) {
    switch (e.type) {
      case 'ChestOpened':
        next.set(e.placementId, { ...(next.get(e.placementId) ?? { placementId: e.placementId }), open: true });
        break;
      case 'CommandRejected':
        break;
    }
  }
  return next;
}
