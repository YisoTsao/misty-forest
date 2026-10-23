import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type * as THREE from 'three';
import { groupPlacementsByPrefab, type WorldData } from '@/game-core/world/worldData';
import type { Placement, Prefab } from '@/game-core/world/types';
import { useGameStateStore } from '@/game/state/gameStateStore';
import { assetUrl } from '@/game/worldData';
import { PROCEDURAL_PREFIX } from '@/render/proceduralModels';
import { Chest } from '../entities/props/Chest';
import { InstancedPrefab } from './InstancedPrefab';

/** 轉動機關沒有指定 cullDistance 時的剔除距離（與 InstancedPrefab 的預設相同） */
const TURNABLE_CULL_DISTANCE = 230;

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
        if (prefab.turn && prefab.model) return <TurnableGroup key={prefabId} prefab={prefab} placements={list} />;
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
  // 採集的實例不從陣列移除（會重建 InstancedMesh、畫面跳動），改用 hidden 隱藏
  const harvested = useMemo(() => new Set(placements.filter((p) => objects.get(p.id)?.harvested).map((p) => p.id)), [objects, placements]);
  const standing = useMemo(() => new Set(placements.filter((p) => !harvested.has(p.id)).map((p) => p.id)), [harvested, placements]);
  const harvestedModel = prefab.harvest?.harvestedModel;
  return (
    <>
      <InstancedPrefab model={prefab.model} placements={placements} hidden={harvested} cullDistance={prefab.cullDistance} castShadow={prefab.castShadow} />
      {harvestedModel && <InstancedPrefab model={harvestedModel} placements={placements} hidden={standing} cullDistance={prefab.cullDistance} castShadow={prefab.castShadow} />}
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
      <InstancedPrefab model={prefab.model} placements={idle} castShadow={prefab.castShadow} />
      {activeModel && <InstancedPrefab model={activeModel} placements={active} castShadow={prefab.castShadow} />}
    </>
  );
}

/**
 * 可轉動的機關（規格 P-02 水輪）：每個機關依權威狀態的轉動位置繞原點旋轉（轉軸沿模型的 X 軸）。
 * 模型本身放在機關原點，外層的 group 負責擺放與朝向。
 * 模型交給 InstancedPrefab 時位置是原點，它的區塊剔除會以世界原點算距離（祕林在 2000 m 外，整個被藏起來），
 * 所以內層不剔除，改由外層依機關的實際位置剔除。
 */
function TurnableGroup({ prefab, placements }: { prefab: Prefab; placements: readonly Placement[] }) {
  const objects = useGameStateStore((s) => s.state.objects);
  const positions = prefab.turn?.positions ?? 4;
  return (
    <>
      {placements.map((p) => (
        <Turnable key={p.id} prefab={prefab} placement={p} angle={((objects.get(p.id)?.turn ?? 0) * Math.PI * 2) / positions} />
      ))}
    </>
  );
}

const TURNABLE_CULL_INTERVAL = 0.3;

function Turnable({ prefab, placement: p, angle }: { prefab: Prefab; placement: Placement; angle: number }) {
  const ref = useRef<THREE.Group>(null);
  const local = useMemo(() => ({ since: Infinity, limit: ((prefab.cullDistance ?? TURNABLE_CULL_DISTANCE) + 8) ** 2 }), [prefab.cullDistance]);
  const origin = useMemo(() => [{ ...p, position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 1, 1] as [number, number, number] }], [p]);
  useFrame(({ camera }, dt) => {
    local.since += dt;
    if (local.since < TURNABLE_CULL_INTERVAL || !ref.current) return;
    local.since = 0;
    const dx = camera.position.x - p.position[0];
    const dz = camera.position.z - p.position[2];
    ref.current.visible = dx * dx + dz * dz < local.limit;
  });
  return (
    <group ref={ref} position={p.position} rotation={[0, p.rotation?.[1] ?? 0, 0]} scale={p.scale}>
      <group rotation={[angle, 0, 0]}>
        <InstancedPrefab model={prefab.model} placements={origin} castShadow={prefab.castShadow} cullDistance={Infinity} />
      </group>
    </group>
  );
}
