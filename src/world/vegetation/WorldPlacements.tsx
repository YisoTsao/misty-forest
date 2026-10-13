import { useMemo } from 'react';
import { groupPlacementsByPrefab, type WorldData } from '@/game-core/world/worldData';
import { Chest } from '../entities/props/Chest';
import { InstancedPrefab } from './InstancedPrefab';

/**
 * 依 prefab 分組渲染所有資料驅動的世界物件。
 * 一般物件以 InstancedMesh 批次渲染；prefab 宣告了 entity 的物件（例如寶箱）個別渲染。
 */
export function WorldPlacements({ data }: { data: WorldData }) {
  const groups = useMemo(() => [...groupPlacementsByPrefab(data.placements)], [data]);
  return (
    <>
      {groups.map(([prefabId, list]) => {
        const prefab = data.prefabs.get(prefabId);
        if (!prefab) return null; // parseWorldData 已保證存在
        switch (prefab.entity) {
          case 'chest':
            return list.map((p) => <Chest key={p.id} placement={p} model={prefab.model} />);
          case undefined:
            return <InstancedPrefab key={prefabId} model={prefab.model} placements={list} />;
        }
      })}
    </>
  );
}
