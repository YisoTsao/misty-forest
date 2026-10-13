import { describe, expect, it } from 'vitest';
import { applyWorldEvents, canInteract, handleInteract, type WorldLookup } from './objects';
import type { ObjectRuntime, Placement, Prefab } from './types';

const prefabs: Prefab[] = [
  {
    id: 'chest',
    model: 'chest.glb',
    collider: 'static',
    collision: { shape: 'box', size: [1, 1, 1] },
    interaction: 'open',
    nameKey: 'object.chest',
    persists: true,
  },
  { id: 'tree', model: 'tree.gltf', collider: 'none', interaction: 'harvest', nameKey: 'object.tree', persists: true },
  { id: 'rock', model: 'rock.gltf', collider: 'none', persists: false },
];
const placements: Placement[] = [
  { id: 'c1', prefabId: 'chest', regionId: 'meadow', position: [0, 0, 0] },
  { id: 't1', prefabId: 'tree', regionId: 'meadow', position: [5, 0, 0] },
  { id: 'r1', prefabId: 'rock', regionId: 'meadow', position: [9, 0, 0] },
];
const world: WorldLookup = {
  placement: (id) => placements.find((p) => p.id === id),
  prefab: (id) => prefabs.find((p) => p.id === id),
};
const empty = new Map<string, ObjectRuntime>();

describe('handleInteract', () => {
  it('打開未開啟的寶箱，事件套用後狀態為 open', () => {
    const events = handleInteract(empty, world, { type: 'Interact', placementId: 'c1' });
    expect(events).toEqual([{ type: 'ChestOpened', placementId: 'c1' }]);
    const next = applyWorldEvents(empty, events);
    expect(next.get('c1')).toEqual({ placementId: 'c1', open: true });
    expect(empty.size).toBe(0); // 不修改輸入
  });

  it('已打開的寶箱不能再開（獎勵不可重複領）', () => {
    const opened = applyWorldEvents(empty, [{ type: 'ChestOpened', placementId: 'c1' }]);
    expect(handleInteract(opened, world, { type: 'Interact', placementId: 'c1' })).toEqual([
      { type: 'CommandRejected', placementId: 'c1', reason: 'already-open' },
    ]);
  });

  it('拒絕不存在、不可互動或尚未實作的物件', () => {
    const reason = (id: string) => {
      const [e] = handleInteract(empty, world, { type: 'Interact', placementId: id });
      return e?.type === 'CommandRejected' ? e.reason : null;
    };
    expect(reason('nope')).toBe('unknown-object');
    expect(reason('r1')).toBe('not-interactable');
    expect(reason('t1')).toBe('not-implemented');
  });

  it('拒絕事件不改變狀態', () => {
    const next = applyWorldEvents(empty, [{ type: 'CommandRejected', placementId: 'c1', reason: 'already-open' }]);
    expect(next.size).toBe(0);
  });
});

describe('canInteract', () => {
  it('只有尚未打開的寶箱顯示提示；未實作的互動不顯示', () => {
    const [chest, tree, rock] = prefabs as [Prefab, Prefab, Prefab];
    expect(canInteract(chest, undefined)).toBe(true);
    expect(canInteract(chest, { placementId: 'c1', open: true })).toBe(false);
    expect(canInteract(tree, undefined)).toBe(false);
    expect(canInteract(rock, undefined)).toBe(false);
  });
});
