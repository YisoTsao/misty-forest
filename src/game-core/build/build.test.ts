import { describe, expect, it } from 'vitest';
import buildablesData from '@/data/buildables.json';
import itemsData from '@/data/items.json';
import prefabsData from '@/data/prefabs.json';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameState } from '../authority/rules';
import { countItem } from '../inventory/inventory';
import { testContext } from '../testing/fixtures';
import { BUILD_AREA, parseBuildables, placementProblem, snapToGrid, snapYaw } from './build';

const ctx = testContext();
const run = (state: GameState, cmd: GameCommand, c = ctx) => {
  const events = handleCommand(state, cmd, c);
  return { events, state: applyEvents(state, events, c) };
};
const withWood = (state: GameState, n: number) => applyEvents(state, [{ type: 'ItemsGained', items: [{ itemId: 'wood', count: n }] }], ctx);
const reason = (state: GameState, cmd: GameCommand, c = ctx) => {
  const [e] = handleCommand(state, cmd, c);
  return e?.type === 'CommandRejected' ? e.reason : null;
};
const center = { x: BUILD_AREA.x, z: BUILD_AREA.z };

describe('建造資料', () => {
  it('專案的建造物資料合法（prefab 與材料都存在）', () => {
    const b = parseBuildables(buildablesData, { prefabs: new Set(prefabsData.map((p) => p.id)), items: new Set(itemsData.map((i) => i.id)) });
    expect(b.size).toBeGreaterThanOrEqual(8);
  });
  it('網格吸附與旋轉吸附', () => {
    expect(snapToGrid(1.26)).toBe(1.5);
    expect(snapToGrid(-0.24)).toBe(-0);
    expect(snapYaw(0.7)).toBeCloseTo(Math.PI / 4);
    expect(snapYaw(-Math.PI / 4)).toBeCloseTo((7 * Math.PI) / 4);
  });
});

describe('PlaceBuilding（規格 6.7）', () => {
  it('在小島上、材料足夠：放置、扣材料、位置吸附到網格', () => {
    const s = withWood(initialGameState(), 5);
    const { events, state } = run(s, { type: 'PlaceBuilding', buildable: 'fire', x: center.x + 0.26, z: center.z - 0.1, yaw: 0.8 });
    expect(events[0]).toMatchObject({ type: 'BuildingPlaced', building: { id: 'building_1', buildable: 'fire', x: snapToGrid(center.x + 0.26), z: snapToGrid(center.z - 0.1) } });
    expect(state.buildings).toHaveLength(1);
    expect(state.buildings[0]!.yaw).toBeCloseTo(Math.PI / 4);
    expect(countItem(state.inventory, 'wood')).toBe(2);
    expect(state.nextBuildingId).toBe(2);
  });

  it('材料不足不可建；背包不變', () => {
    const s = withWood(initialGameState(), 2);
    expect(reason(s, { type: 'PlaceBuilding', buildable: 'fire', ...center, yaw: 0 })).toBe('missing-materials');
  });

  it('無效位置不可放：小島外、水裡、與其他建造物重疊、被世界物件擋住', () => {
    const s = withWood(initialGameState(), 10);
    expect(reason(s, { type: 'PlaceBuilding', buildable: 'fire', x: 0, z: 18, yaw: 0 })).toBe('outside-area');
    expect(reason(s, { type: 'PlaceBuilding', buildable: 'fire', x: BUILD_AREA.x + BUILD_AREA.radius - 0.2, z: center.z, yaw: 0 })).toBe('outside-area');
    const placed = run(s, { type: 'PlaceBuilding', buildable: 'fire', ...center, yaw: 0 }).state;
    expect(reason(placed, { type: 'PlaceBuilding', buildable: 'stool', x: center.x + 0.5, z: center.z, yaw: 0 })).toBe('blocked');
    expect(reason(placed, { type: 'PlaceBuilding', buildable: 'stool', x: center.x + 1.5, z: center.z, yaw: 0 })).toBeNull();
    const blockedWorld = { ...ctx, isOccupied: () => true };
    expect(reason(s, { type: 'PlaceBuilding', buildable: 'fire', ...center, yaw: 0 }, blockedWorld)).toBe('blocked');
  });

  it('placementProblem：地面低於水面視為水裡', () => {
    const def = ctx.buildables.get('fire')!;
    const inv = withWood(initialGameState(), 9).inventory;
    // 小島中心是平地，不在水裡也不陡
    expect(placementProblem(def, center, [], ctx.buildables, inv, () => false)).toBeNull();
  });

  it('拒絕未知的建造物與非數值座標', () => {
    const s = withWood(initialGameState(), 5);
    expect(reason(s, { type: 'PlaceBuilding', buildable: 'castle', ...center, yaw: 0 })).toBe('unknown-buildable');
    expect(reason(s, { type: 'PlaceBuilding', buildable: 'fire', x: Number.NaN, z: 0, yaw: 0 })).toBe('invalid-command');
  });
});

describe('RemoveBuilding', () => {
  it('拆除退還全部材料；未知的建造物被拒絕', () => {
    let s = withWood(initialGameState(), 3);
    s = run(s, { type: 'PlaceBuilding', buildable: 'fire', ...center, yaw: 0 }).state;
    expect(countItem(s.inventory, 'wood')).toBe(0);
    const r = run(s, { type: 'RemoveBuilding', buildingId: 'building_1' });
    expect(r.events.map((e) => e.type)).toEqual(['BuildingRemoved', 'ItemsGained']);
    expect(r.state.buildings).toHaveLength(0);
    expect(countItem(r.state.inventory, 'wood')).toBe(3);
    expect(reason(r.state, { type: 'RemoveBuilding', buildingId: 'building_1' })).toBe('unknown-building');
  });
});
