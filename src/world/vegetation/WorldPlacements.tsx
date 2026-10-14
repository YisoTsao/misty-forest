import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import { groupPlacementsByPrefab, type WorldData } from '@/game-core/world/worldData';
import type { Placement, Prefab } from '@/game-core/world/types';
import { useGameStateStore } from '@/game/state/gameStateStore';
import { assetUrl } from '@/game/worldData';
import { PROCEDURAL_PREFIX } from '@/render/proceduralModels';
import { Chest } from '../entities/props/Chest';
import { InstancedPrefab } from './InstancedPrefab';

/**
 * 依 prefab 分組渲染所有資料驅動的世界物件。
 * 一般物件以 InstancedMesh 批次渲染；prefab 宣告了 entity 的物件（例如寶箱）個別渲染；
 * 可採集的物件依權威狀態分成「未採集」與「已採集」（樹樁或隱藏）兩組。
 */
export function WorldPlacements({ data }: { data: WorldData }) {
  const groups = useMemo(() => [...groupPlacementsByPrefab(data.placements)], [data]);
  // 採集後才出現的模型（樹樁）在場景載入時一起載入，採集當下不會觸發 Suspense 讓整個世界閃爍
  const lateModels = useMemo(
    () =>
      [...data.prefabs.values()]
        .map((p) => p.harvest?.harvestedModel)
        .filter((m): m is string => m !== undefined && !m.startsWith(PROCEDURAL_PREFIX))
        .map(assetUrl),
    [data],
  );
  useGLTF(lateModels);
  return (
    <>
      {groups.map(([prefabId, list]) => {
        const prefab = data.prefabs.get(prefabId);
        if (!prefab) return null; // parseWorldData 已保證存在
        if (prefab.entity === 'chest') return list.map((p) => <Chest key={p.id} placement={p} model={prefab.model} />);
        if (prefab.harvest) return <HarvestableGroup key={prefabId} prefab={prefab} placements={list} />;
        if (prefab.repair) return <RepairableGroup key={prefabId} prefab={prefab} placements={list} />;
        if (prefab.activate) return <ActivatableGroup key={prefabId} prefab={prefab} placements={list} />;
        return (
          <InstancedPrefab
            key={prefabId}
            model={prefab.model}
            placements={list}
            animate={prefab.animate}
            cullDistance={prefab.cullDistance}
            castShadow={prefab.castShadow}
            nightWindows={prefab.nightWindows}
          />
        );
      })}
    </>
  );
}

/**
 * 可採集物件（規格 5.2：砍後隱藏 instance 並記重生）。
 * objects 只在物件事件發生時換新參照，因此分組只在採集 / 重生時重新計算。
 */
function HarvestableGroup({ prefab, placements }: { prefab: Prefab; placements: readonly Placement[] }) {
  const objects = useGameStateStore((s) => s.state.objects);
  const [standing, harvested] = useMemo(() => {
    const standing: Placement[] = [];
    const harvested: Placement[] = [];
    for (const p of placements) (objects.get(p.id)?.harvested ? harvested : standing).push(p);
    return [standing, harvested];
  }, [objects, placements]);
  const harvestedModel = prefab.harvest?.harvestedModel;
  return (
    <>
      <InstancedPrefab model={prefab.model} placements={standing} cullDistance={prefab.cullDistance} castShadow={prefab.castShadow} />
      {harvestedModel && <InstancedPrefab model={harvestedModel} placements={harvested} cullDistance={prefab.cullDistance} castShadow={prefab.castShadow} />}
    </>
  );
}

/** 可修復物件（規格 5.2 木橋：損毀 / 修復兩狀態），依權威狀態選擇外觀 */
function RepairableGroup({ prefab, placements }: { prefab: Prefab; placements: readonly Placement[] }) {
  const objects = useGameStateStore((s) => s.state.objects);
  const [broken, repaired] = useMemo(() => {
    const broken: Placement[] = [];
    const repaired: Placement[] = [];
    for (const p of placements) (objects.get(p.id)?.repaired ? repaired : broken).push(p);
    return [broken, repaired];
  }, [objects, placements]);
  return (
    <>
      <InstancedPrefab model={prefab.model} placements={broken} />
      {prefab.repair && <InstancedPrefab model={prefab.repair.model} placements={repaired} />}
    </>
  );
}

/** 開關式機關（任務 8C：路燈、樹根、閘門、苔蘚節點），依權威狀態選擇外觀；啟動後沒有外觀的物件隱藏 */
function ActivatableGroup({ prefab, placements }: { prefab: Prefab; placements: readonly Placement[] }) {
  const objects = useGameStateStore((s) => s.state.objects);
  const [idle, active] = useMemo(() => {
    const idle: Placement[] = [];
    const active: Placement[] = [];
    for (const p of placements) (objects.get(p.id)?.active ? active : idle).push(p);
    return [idle, active];
  }, [objects, placements]);
  const activeModel = prefab.activate?.model;
  return (
    <>
      <InstancedPrefab model={prefab.model} placements={idle} />
      {activeModel && <InstancedPrefab model={activeModel} placements={active} />}
    </>
  );
}
