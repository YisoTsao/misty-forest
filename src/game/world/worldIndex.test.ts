import { describe, expect, it } from 'vitest';
import { parseWorldData } from '@/game-core/world/worldData';
import prefabs from '@/data/prefabs.json';
import placements from '@/data/placements.json';
import { WorldIndex } from './worldIndex';

const data = parseWorldData(
  [
    { id: 'tree', model: 't.gltf', collider: 'static', collision: { shape: 'cylinder', radius: 0.1, height: 0.5 }, persists: true },
    {
      id: 'chest',
      model: 'c.glb',
      collider: 'static',
      collision: { shape: 'box', size: [2, 1, 1] },
      interaction: 'open',
      nameKey: 'object.chest',
      interactRadius: 1.5,
      persists: true,
    },
    { id: 'flower', model: 'f.gltf', collider: 'none', persists: false },
    {
      id: 'fence',
      model: 'fe.gltf',
      collider: 'static',
      collision: { shape: 'box', size: [0.1, 0.5, 1], offset: [-1, 0, 0] },
      persists: false,
    },
  ],
  [
    { id: 't1', prefabId: 'tree', regionId: 'meadow', position: [10, 2, 0], scale: [5, 6, 4] },
    { id: 'c1', prefabId: 'chest', regionId: 'meadow', position: [0, 0, 0], rotation: [0, 1, 0], scale: [0.5, 0.5, 0.5] },
    { id: 'f1', prefabId: 'flower', regionId: 'meadow', position: [1, 0, 1] },
    { id: 'fe1', prefabId: 'fence', regionId: 'village', position: [30, 0, 30], rotation: [0, Math.PI / 2, 0], scale: [2, 2, 2] },
  ],
);

describe('WorldIndex', () => {
  const index = new WorldIndex(data);

  it('碰撞體尺寸套用 placement 縮放（圓柱取水平較大的縮放）', () => {
    const [tree] = index.colliders.query(10, 0, 0.1);
    expect(tree?.shape).toEqual({ kind: 'cylinder', radius: 0.5, height: 3 });
    expect(tree?.y).toBe(2);
  });

  it('方塊碰撞體使用半邊長並保留旋轉', () => {
    const [chest] = index.colliders.query(0, 0, 0.1);
    expect(chest?.shape).toEqual({ kind: 'box', halfExtents: [0.5, 0.25, 0.25] });
    expect(chest?.yaw).toBe(1);
  });

  it('碰撞體局部位移套用縮放與 yaw 旋轉', () => {
    // 局部 (-1, 0, 0) × 2 = (-2, 0, 0)；繞 Y 轉 90° → (0, 0, 2)
    const [fence] = index.colliders.query(30, 32, 0.1);
    expect(fence?.id).toBe('fe1');
    expect(fence?.x).toBeCloseTo(30);
    expect(fence?.z).toBeCloseTo(32);
  });

  it('isOccupied：圓柱與旋轉後的方塊範圍內為 true', () => {
    expect(index.isOccupied(10.4, 0, 0)).toBe(true); // 樹幹半徑 0.5
    expect(index.isOccupied(10.7, 0, 0)).toBe(false);
    // 寶箱方塊半寬 (0.5, 0.25)，yaw = 1 rad
    const along = { x: Math.cos(1) * 0.45, z: -Math.sin(1) * 0.45 };
    expect(index.isOccupied(along.x, along.z, 0)).toBe(true);
    const across = { x: Math.sin(1) * 0.45, z: Math.cos(1) * 0.45 };
    expect(index.isOccupied(across.x, across.z, 0)).toBe(false);
  });

  it('沒有碰撞的物件不建立碰撞體；只有可互動物件進入互動格網', () => {
    expect(index.colliderCount).toBe(3);
    expect(index.interactables.query(0, 0, 50).map((s) => s.id)).toEqual(['c1']);
    expect(index.interactables.query(0, 0, 1)[0]?.radius).toBe(1.5);
  });

  it('專案資料：每個 static prefab 的 placement 都有碰撞體，且寶箱可互動', () => {
    const project = new WorldIndex(parseWorldData(prefabs, placements));
    const staticPrefabs = new Set(prefabs.filter((p) => p.collider === 'static').map((p) => p.id));
    expect(project.colliderCount).toBe(placements.filter((p) => staticPrefabs.has(p.prefabId)).length);
    const chest = placements.find((p) => p.prefabId === 'chest_wood');
    if (!chest) throw new Error('placements 內沒有寶箱');
    const [x = 0, , z = 0] = chest.position;
    expect(project.interactables.query(x, z, 0.1).map((s) => s.id)).toContain(chest.id);
  });
});
