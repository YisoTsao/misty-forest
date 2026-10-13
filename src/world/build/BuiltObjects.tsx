import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRapier, type RapierCollider } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Building, BuildableDef } from '@/game-core/build/build';
import { collisionShapes, type Placement } from '@/game-core/world/types';
import { terrainHeight } from '@/game-core/world/terrain';
import { buildables, worldIndex } from '@/game/authority';
import { buildRuntime, REMOVE_TOOL } from '@/game/build/buildRuntime';
import { useGameStateStore } from '@/game/state/gameStateStore';
import { useUiStore } from '@/game/state/uiStore';
import { assetUrl } from '@/game/worldData';
import { buildProceduralModel, PROCEDURAL_PREFIX } from '@/render/proceduralModels';
import { MAX_CLEARINGS, vegetationUniforms } from '@/render/vegetation';
import { InstancedPrefab } from '../vegetation/InstancedPrefab';

function placementOf(b: Building, def: BuildableDef): Placement {
  return {
    id: b.id,
    prefabId: def.prefabId,
    regionId: 'home',
    position: [b.x, terrainHeight(b.x, b.z), b.z],
    rotation: [0, b.yaw, 0],
    scale: [def.scale, def.scale, def.scale],
  };
}

/** 已放置的建造物（規格 6.7）：依類型以 InstancedMesh 渲染，並建立碰撞體。只讀權威狀態。 */
export function BuiltObjects() {
  const buildings = useGameStateStore((s) => s.state.buildings);
  // 所有可建造的模型在場景載入時一起載入，放置當下不會觸發 Suspense
  const models = useMemo(
    () =>
      [...new Set([...buildables.values()].map((b) => worldIndex.prefab(b.prefabId)?.model))]
        .filter((m): m is string => m !== undefined && !m.startsWith(PROCEDURAL_PREFIX))
        .map(assetUrl),
    [],
  );
  useGLTF(models);
  // 建造物腳下的草花縮入地面（草叢在載入時就散佈好了）
  useEffect(() => {
    const list = buildings.slice(0, MAX_CLEARINGS);
    list.forEach((b, i) => vegetationUniforms.uClearings.value[i]!.set(b.x, b.z, (buildables.get(b.buildable)?.footprint ?? 0.5) + 0.2, 0));
    vegetationUniforms.uClearCount.value = list.length;
  }, [buildings]);
  const groups = useMemo(() => {
    const map = new Map<string, Placement[]>();
    for (const b of buildings) {
      const def = buildables.get(b.buildable);
      if (!def) continue;
      const list = map.get(def.prefabId) ?? [];
      list.push(placementOf(b, def));
      map.set(def.prefabId, list);
    }
    return [...map];
  }, [buildings]);

  return (
    <>
      {groups.map(([prefabId, list]) => {
        const model = worldIndex.prefab(prefabId)?.model;
        return model ? <InstancedPrefab key={prefabId} model={model} placements={list} /> : null;
      })}
      <BuildingColliders buildings={buildings} />
      <CampfireFlames buildings={buildings} />
      <GhostPreview />
    </>
  );
}

/** 建造物的碰撞體：數量少，依權威狀態整批同步 */
function BuildingColliders({ buildings }: { buildings: readonly Building[] }) {
  const { world, rapier } = useRapier();
  const active = useMemo(() => new Map<string, RapierCollider[]>(), []);
  useEffect(() => {
    const ids = new Set(buildings.map((b) => b.id));
    for (const [id, colliders] of active) {
      if (ids.has(id)) continue;
      for (const c of colliders) if (world.getCollider(c.handle)) world.removeCollider(c, false);
      active.delete(id);
    }
    for (const b of buildings) {
      if (active.has(b.id)) continue;
      const def = buildables.get(b.buildable);
      const prefab = def && worldIndex.prefab(def.prefabId);
      if (!def || !prefab || prefab.collider !== 'static') continue;
      const y = terrainHeight(b.x, b.z);
      const colliders = collisionShapes(prefab.collision).map((shape) => {
        const [ox = 0, oy = 0, oz = 0] = shape.offset ?? [];
        const cos = Math.cos(b.yaw);
        const sin = Math.sin(b.yaw);
        const lx = ox * def.scale;
        const lz = oz * def.scale;
        const half = shape.shape === 'cylinder' ? (shape.height * def.scale) / 2 : (shape.size[1] * def.scale) / 2;
        const desc =
          shape.shape === 'cylinder'
            ? rapier.ColliderDesc.cylinder(half, shape.radius * def.scale)
            : rapier.ColliderDesc.cuboid((shape.size[0] * def.scale) / 2, half, (shape.size[2] * def.scale) / 2);
        desc
          .setTranslation(b.x + lx * cos + lz * sin, y + oy * def.scale + half, b.z - lx * sin + lz * cos)
          .setRotation({ x: 0, y: Math.sin(b.yaw / 2), z: 0, w: Math.cos(b.yaw / 2) });
        return world.createCollider(desc);
      });
      active.set(b.id, colliders);
    }
  }, [buildings, world, rapier, active]);
  useEffect(
    () => () => {
      for (const colliders of active.values()) for (const c of colliders) if (world.getCollider(c.handle)) world.removeCollider(c, false);
      active.clear();
    },
    [world, active],
  );
  return null;
}

/** 營火的火焰：在模型的火焰上方疊一層會跳動的發光錐體 */
function CampfireFlames({ buildings }: { buildings: readonly Building[] }) {
  const fires = buildings.filter((b) => b.buildable === 'campfire');
  const geo = useMemo(() => new THREE.ConeGeometry(0.16, 0.5, 7).translate(0, 0.25, 0), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.3, 0.35), transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false }), []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    refs.current.forEach((m, i) => {
      if (!m) return;
      const f = 1 + Math.sin(t * 11 + i * 2) * 0.12 + Math.sin(t * 17.3 + i) * 0.08;
      m.scale.set(1, f, 1);
      m.rotation.y = t * 1.5 + i;
    });
  });
  return (
    <>
      {fires.map((b, i) => (
        <mesh key={b.id} ref={(m) => void (refs.current[i] = m)} geometry={geo} material={mat} position={[b.x, terrainHeight(b.x, b.z) + 0.12, b.z]} renderOrder={2} />
      ))}
    </>
  );
}

const ghostOk = new THREE.MeshBasicMaterial({ color: '#7dffb0', transparent: true, opacity: 0.45, depthWrite: false });
const ghostBad = new THREE.MeshBasicMaterial({ color: '#ff6b6b', transparent: true, opacity: 0.45, depthWrite: false });

/** 預覽幽靈物件：綠色可放置、紅色不可放置（規格 6.7） */
function GhostPreview() {
  const selected = useUiStore((s) => (s.build && !s.build.menu ? s.build.selected : null));
  if (selected === REMOVE_TOOL) return <RemoveMarker />;
  const def = selected ? buildables.get(selected) : undefined;
  const model = def ? worldIndex.prefab(def.prefabId)?.model : undefined;
  if (!def || !model) return null;
  return model.startsWith(PROCEDURAL_PREFIX) ? <ProceduralGhost def={def} model={model} /> : <GltfGhost def={def} model={model} />;
}

/** 拆除工具：在對準的建造物腳下畫一圈紅色光環 */
function RemoveMarker() {
  const ref = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => new THREE.RingGeometry(0.88, 1, 48).rotateX(-Math.PI / 2), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff5a5a', transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }), []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  const buildings = useGameStateStore((s) => s.state.buildings);
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    const target = buildings.find((b) => b.id === buildRuntime.removeTarget);
    const def = target && buildables.get(target.buildable);
    m.visible = Boolean(target && def);
    if (!target || !def) return;
    m.position.set(target.x, terrainHeight(target.x, target.z) + 0.05, target.z);
    m.scale.setScalar((def.footprint + 0.25) * (1 + Math.sin(clock.elapsedTime * 6) * 0.04));
  });
  return <mesh ref={ref} geometry={geo} material={mat} renderOrder={2} />;
}

function GltfGhost({ def, model }: { def: BuildableDef; model: string }) {
  const gltf = useGLTF(assetUrl(model));
  const root = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((o) => {
      if (o instanceof THREE.Mesh) o.material = ghostOk;
    });
    return clone;
  }, [gltf.scene]);
  return <GhostFollower def={def} object={root} />;
}

function ProceduralGhost({ def, model }: { def: BuildableDef; model: string }) {
  const root = useMemo(() => {
    const group = new THREE.Group();
    for (const part of buildProceduralModel(model)) {
      part.material.dispose();
      group.add(new THREE.Mesh(part.geometry, ghostOk));
    }
    return group;
  }, [model]);
  useEffect(
    () => () =>
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      }),
    [root],
  );
  return <GhostFollower def={def} object={root} />;
}

function GhostFollower({ def, object }: { def: BuildableDef; object: THREE.Object3D }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    g.visible = buildRuntime.ready;
    g.position.set(buildRuntime.x, terrainHeight(buildRuntime.x, buildRuntime.z) + 0.02, buildRuntime.z);
    g.rotation.y = buildRuntime.yaw;
    const material = buildRuntime.problem === null ? ghostOk : ghostBad;
    object.traverse((o) => {
      if (o instanceof THREE.Mesh) o.material = material;
    });
  });
  return (
    <group ref={ref} scale={def.scale} name="build-ghost">
      <primitive object={object} />
    </group>
  );
}
