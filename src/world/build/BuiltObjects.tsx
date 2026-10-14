import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRapier, type RapierCollider } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { growthStage, type Building, type BuildableDef } from '@/game-core/build/build';
import { collisionShapes, type Placement } from '@/game-core/world/types';
import { terrainHeight } from '@/game-core/world/terrain';
import { buildables, worldIndex } from '@/game/authority';
import { buildRuntime, REMOVE_TOOL } from '@/game/build/buildRuntime';
import { useGameStateStore } from '@/game/state/gameStateStore';
import { useUiStore } from '@/game/state/uiStore';
import { timeRuntime } from '@/game/world/timeRuntime';
import { assetUrl } from '@/game/worldData';
import { buildProceduralModel, PROCEDURAL_PREFIX } from '@/render/proceduralModels';
import { sparkTexture } from '@/render/sparkTexture';
import { MAX_CLEARINGS, vegetationUniforms } from '@/render/vegetation';
import { InstancedPrefab } from '../vegetation/InstancedPrefab';

function placementOf(b: Building, def: BuildableDef, stage: number): Placement {
  return {
    id: b.id,
    prefabId: def.growth?.stages[stage] ?? def.prefabId,
    regionId: 'home',
    position: [b.x, terrainHeight(b.x, b.z), b.z],
    rotation: [0, b.yaw, 0],
    scale: [def.scale, def.scale, def.scale],
  };
}

/** 會長大的建造物的階段，例如 "building_3:1,building_5:2"（字串比較，階段不變時不重新渲染） */
function growthKey(buildings: readonly Building[], time: number): string {
  return buildings
    .flatMap((b) => {
      const def = buildables.get(b.buildable);
      return def?.growth ? [`${b.id}:${growthStage(def, b, time)}`] : [];
    })
    .join(',');
}

/** 已放置的建造物（規格 6.7）：依類型以 InstancedMesh 渲染，並建立碰撞體。只讀權威狀態。 */
export function BuiltObjects() {
  const buildings = useGameStateStore((s) => s.state.buildings);
  // 會長大的花圃（任務 7K）：只有階段改變時才重新分組
  const stages = useGameStateStore((s) => growthKey(s.state.buildings, s.state.time));
  // 所有可建造的模型在場景載入時一起載入，放置當下不會觸發 Suspense
  const models = useMemo(
    () =>
      [...new Set([...buildables.values()].flatMap((b) => [b.prefabId, ...(b.growth?.stages ?? [])]).map((p) => worldIndex.prefab(p)?.model))]
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
    const stageOf = new Map(stages.split(',').filter(Boolean).map((e) => e.split(':') as [string, string]));
    for (const b of buildings) {
      const def = buildables.get(b.buildable);
      if (!def) continue;
      const placement = placementOf(b, def, Number(stageOf.get(b.id) ?? 0));
      const list = map.get(placement.prefabId) ?? [];
      list.push(placement);
      map.set(placement.prefabId, list);
    }
    return [...map];
  }, [buildings, stages]);

  return (
    <>
      {groups.map(([prefabId, list]) => {
        const model = worldIndex.prefab(prefabId)?.model;
        return model ? <InstancedPrefab key={prefabId} model={model} placements={list} /> : null;
      })}
      <BuildingColliders buildings={buildings} />
      <CampfireFlames buildings={buildings} />
      <NightGlows buildings={buildings} />
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

/** 會發光的建造物：光暈中心的高度（以建造物縮放前的模型高度計）、大小（公尺）與 HDR 顏色 */
const GLOWS: Record<string, { height: number; size: number; color: [number, number, number] }> = {
  lantern: { height: 0.95, size: 2.2, color: [2.2, 1.7, 0.7] },
  campfire: { height: 0.45, size: 3.2, color: [2.4, 1.2, 0.35] },
};

/**
 * 夜晚光暈（GAME_DESIGN 5.2）：星光燈與營火上方的柔和光點，夜晚變大變亮、觸發 Bloom。
 * 不用即時點光源（效能預算：動態光最多 2 盞留給魔法），全部建造物共用一個 Points。
 */
function NightGlows({ buildings }: { buildings: readonly Building[] }) {
  const glowing = buildings.filter((b) => GLOWS[b.buildable]);
  const geometry = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];
    const sizes: number[] = [];
    for (const b of glowing) {
      const glow = GLOWS[b.buildable]!;
      const scale = buildables.get(b.buildable)?.scale ?? 1;
      positions.push(b.x, terrainHeight(b.x, b.z) + glow.height * scale, b.z);
      colors.push(...glow.color);
      sizes.push(glow.size);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
    return g;
    // glowing 由 buildings 推導
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildings]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uMap: { value: sparkTexture() }, uStrength: { value: 0 }, uScale: { value: 400 }, uTime: { value: 0 } },
        vertexShader: /* glsl */ `
          uniform float uScale;
          uniform float uStrength;
          uniform float uTime;
          attribute float aSize;
          varying vec3 vColor;
          void main() {
            vColor = color;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            float flicker = 1.0 + sin(uTime * 7.0 + position.x * 3.0) * 0.05;
            gl_PointSize = aSize * (0.55 + 0.45 * uStrength) * flicker * uScale / -mv.z;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform sampler2D uMap;
          uniform float uStrength;
          varying vec3 vColor;
          void main() {
            float a = texture2D(uMap, gl_PointCoord).a;
            gl_FragColor = vec4(vColor, a * a * (0.18 + 0.6 * uStrength));
          }
        `,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        fog: false,
      }),
    [],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ gl }, dt) => {
    const u = material.uniforms;
    u.uStrength!.value = timeRuntime.night;
    u.uScale!.value = gl.domElement.height * 0.5;
    u.uTime!.value += Math.min(dt, 0.1);
  });
  if (glowing.length === 0) return null;
  return <points name="night-glows" geometry={geometry} material={material} renderOrder={3} frustumCulled={false} />;
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
