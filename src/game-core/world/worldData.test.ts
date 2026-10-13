import { describe, expect, it } from 'vitest';
import { groupPlacementsByPrefab, parseWorldData, WorldDataError } from './worldData';
import prefabs from '@/data/prefabs.json';
import placements from '@/data/placements.json';

const tree = {
  id: 'pine',
  model: 'models/pine.glb',
  collider: 'static',
  collision: { shape: 'cylinder', radius: 0.1, height: 1 },
  persists: true,
};
const at = (id: string, prefabId = 'pine') => ({ id, prefabId, regionId: 'meadow', position: [0, 0, 0] });

describe('parseWorldData', () => {
  it('接受合法資料並建立 prefab 索引', () => {
    const data = parseWorldData([tree], [at('a'), at('b')]);
    expect(data.prefabs.get('pine')?.model).toBe('models/pine.glb');
    expect(data.placements).toHaveLength(2);
  });

  it('拒絕重複的 placement id', () => {
    expect(() => parseWorldData([tree], [at('a'), at('a')])).toThrow(WorldDataError);
  });

  it('拒絕參照不存在的 prefab', () => {
    expect(() => parseWorldData([tree], [at('a', 'missing')])).toThrow(/missing/);
  });

  it('拒絕未知的 regionId', () => {
    expect(() => parseWorldData([tree], [{ ...at('a'), regionId: 'moon' }])).toThrow(WorldDataError);
  });

  it('static 碰撞的 prefab 必須提供碰撞形狀', () => {
    const noShape: Record<string, unknown> = { ...tree };
    delete noShape.collision;
    expect(() => parseWorldData([noShape], [])).toThrow(/collision/);
  });

  it('可互動的 prefab 必須提供 nameKey', () => {
    expect(() => parseWorldData([{ ...tree, interaction: 'open' }], [])).toThrow(/nameKey/);
  });

  it('專案內的資料檔可通過驗證', () => {
    const data = parseWorldData(prefabs, placements);
    expect(data.placements.length).toBeGreaterThan(0);
  });
});

describe('groupPlacementsByPrefab', () => {
  it('依 prefab 分組', () => {
    const groups = groupPlacementsByPrefab(parseWorldData([tree], [at('a'), at('b')]).placements);
    expect(groups.get('pine')).toHaveLength(2);
  });
});
