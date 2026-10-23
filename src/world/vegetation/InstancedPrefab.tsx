import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import type { Placement, Prefab } from '@/game-core/world/types';
import { chunkPlacements } from '@/game-core/world/worldData';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildProceduralModel, PROCEDURAL_PREFIX, type ModelPart } from '@/render/proceduralModels';
import { patchOcclusion } from '@/render/occlusion';
import { recolorForPalette } from '@/render/palette';
import { toToonMaterial } from '@/render/toon';
import { patchWindowGlow } from '@/render/windowGlow';
import { assetUrl } from '@/game/worldData';

/**
 * 從 GLB 取出所有 mesh，材質轉為 toon；回傳每個部件與其在模型內的局部矩陣。
 * 靜態部件合併成盡量少的 mesh（任務 7A 效能：地圖上有一百多種物件，每個材質一個 draw call、陰影再一次）：
 * 沒有貼圖的部件把底色烘進頂點色、合成一個；共用同一張貼圖與底色的部件合成一個。環境動畫指定的節點保持獨立。
 */
function useGltfParts(model: string, animated: readonly string[]): Part[] {
  const gltf = useGLTF(assetUrl(model));
  const parts = useMemo(() => {
    const list: Part[] = [];
    const groups = new Map<string, { material: THREE.MeshToonMaterial; geometries: THREE.BufferGeometry[]; vertexColors: boolean }>();
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const source = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      if (!source) return;
      const material = toToonMaterial(source);
      recolorForPalette(model, source.name, material.color);
      if (animated.includes(obj.name) || (material.map === null && !obj.geometry.getAttribute('normal'))) {
        // 世界物件會在擋住攝影機時鏤空（render/occlusion.ts）
        list.push({ key: obj.uuid, name: obj.name, geometry: obj.geometry, material: patchOcclusion(material), local: obj.matrixWorld.clone() });
        return;
      }
      const geo = (obj.geometry as THREE.BufferGeometry).clone().applyMatrix4(obj.matrixWorld);
      const vertexColors = material.map === null;
      const key = vertexColors ? 'vc' : `${material.map?.uuid}:${material.color.getHexString()}:${material.transparent}`;
      // 合併時屬性必須一致：只留位置、法線（與貼圖座標或頂點色）
      for (const name of Object.keys(geo.attributes)) {
        if (name !== 'position' && name !== 'normal' && !(name === 'uv' && !vertexColors)) geo.deleteAttribute(name);
      }
      if (!geo.index) geo.setIndex([...Array(geo.getAttribute('position').count).keys()]);
      if (vertexColors) {
        const count = geo.getAttribute('position').count;
        const colors = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) material.color.toArray(colors, i * 3);
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      }
      const group = groups.get(key);
      if (group) {
        group.geometries.push(geo);
        material.dispose();
      } else {
        if (vertexColors) {
          material.vertexColors = true;
          material.color.set('#ffffff');
        }
        groups.set(key, { material, geometries: [geo], vertexColors });
      }
    });
    for (const [key, g] of groups) {
      const merged = g.geometries.length === 1 ? g.geometries[0]! : mergeGeometries(g.geometries);
      if (!merged) throw new Error(`模型部件合併失敗：${model}（${key}）`);
      if (merged !== g.geometries[0]) g.geometries.forEach((x) => x.dispose());
      merged.computeBoundingSphere();
      list.push({ key: `merged:${key}`, geometry: merged, material: patchOcclusion(g.material), local: new THREE.Matrix4(), owned: true });
    }
    if (list.length === 0) throw new Error(`模型沒有可渲染的 mesh：${model}`);
    return list;
  }, [gltf, model, animated]);

  // toon 材質與合併後的幾何為本元件建立，需自行釋放；原始 geometry 由 useGLTF 快取持有
  useEffect(
    () => () =>
      parts.forEach((p) => {
        p.material.dispose();
        if (p.owned) p.geometry.dispose();
      }),
    [parts],
  );
  return parts;
}

const NO_ANIMATION: readonly string[] = [];

/** owned：幾何由本元件建立（合併後的部件），卸載時一併釋放 */
type Part = ModelPart & { owned?: boolean };

const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const tmpScale = new THREE.Vector3();
const tmpMatrix = new THREE.Matrix4();

function placementMatrix(p: Placement, out: THREE.Matrix4): THREE.Matrix4 {
  tmpPos.fromArray(p.position);
  tmpQuat.setFromEuler(tmpEuler.fromArray(p.rotation ?? [0, 0, 0]));
  tmpScale.fromArray(p.scale ?? [1, 1, 1]);
  return out.compose(tmpPos, tmpQuat, tmpScale);
}

type Animation = NonNullable<Prefab['animate']>[number];
const tmpAxis = new THREE.Vector3();
const tmpRot = new THREE.Matrix4();

function InstancedPart({
  part,
  placements,
  hidden,
  receiveShadow,
  castShadow,
  anim,
}: {
  part: Part;
  placements: readonly Placement[];
  hidden?: ReadonlySet<string>;
  receiveShadow: boolean;
  castShadow: boolean;
  anim?: Animation;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  // 環境動畫（風車扇葉、衣服）：每幀以部件自己的原點與局部軸旋轉；每個 placement 相位不同
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!anim || !mesh) return;
    const t = clock.elapsedTime;
    tmpAxis.fromArray(anim.axis).normalize();
    placements.forEach((p, i) => {
      const phase = i * 1.7;
      const angle = anim.kind === 'spin' ? anim.speed * t + phase : Math.sin(anim.speed * t + phase) * (anim.amplitude ?? 0.2);
      if (hidden?.has(p.id)) mesh.setMatrixAt(i, HIDDEN_MATRIX);
      else mesh.setMatrixAt(i, placementMatrix(p, tmpMatrix).multiply(part.local).multiply(tmpRot.makeRotationAxis(tmpAxis, angle)));
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    placements.forEach((p, i) => {
      if (hidden?.has(p.id)) mesh.setMatrixAt(i, HIDDEN_MATRIX);
      else mesh.setMatrixAt(i, placementMatrix(p, tmpMatrix).multiply(part.local));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [part, placements, hidden]);

  // 實例數固定為 placements.length：採集或重生時只改矩陣（隱藏的實例縮成 0），不重建 InstancedMesh
  // （重建會讓整批模型閃一下，畫面跳開又跳回來）
  return <instancedMesh ref={ref} args={[part.geometry, part.material, placements.length]} castShadow={castShadow} receiveShadow={receiveShadow} />;
}

/** 程式產生的模型：geometry 與 material 都由本元件建立與釋放 */
function useProceduralParts(model: string): Part[] {
  const parts = useMemo(() => buildProceduralModel(model), [model]);
  useEffect(
    () => () =>
      parts.forEach((p) => {
        p.geometry.dispose();
        p.material.dispose();
      }),
    [parts],
  );
  return parts;
}

/** 隱藏的實例：縮放為 0，不佔畫面也不投影 */
const HIDDEN_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

type InstancedProps = {
  model: string;
  placements: readonly Placement[];
  /** 這些 placement 暫時隱藏（採集後的樹、未採集的樹樁）：實例保留，矩陣縮成 0 */
  hidden?: ReadonlySet<string>;
  animate?: Prefab['animate'];
  /** 超過這個距離的區塊不畫（省略時用 DEFAULT_CULL_DISTANCE） */
  cullDistance?: number;
  castShadow?: boolean;
  /** 夜晚窗戶亮燈（任務 7N） */
  nightWindows?: boolean;
};

/** 一般物件的最遠繪製距離：晴朗時的霧在 230 m 完全遮住，再遠畫了也看不到 */
const DEFAULT_CULL_DISTANCE = 230;
/** 區塊可見性的檢查間隔（秒） */
const CULL_INTERVAL = 0.3;

/**
 * 同一 prefab 的所有 placement 以 InstancedMesh 渲染（規格 4.3、7）。
 * 依位置分成 64 m 的區塊（任務 7A）：每塊一組 InstancedMesh，視錐外的區塊（含陰影）由 three 剔除；
 * 模型的材質與幾何所有區塊共用。
 */
export function InstancedPrefab(props: InstancedProps) {
  if (props.placements.length === 0) return null;
  return props.model.startsWith(PROCEDURAL_PREFIX) ? <ProceduralInstanced {...props} /> : <GltfInstanced {...props} />;
}

function GltfInstanced(props: InstancedProps) {
  const parts = useGltfParts(props.model, useMemo(() => props.animate?.map((a) => a.node) ?? NO_ANIMATION, [props.animate]));
  // 村屋的窗戶：夜晚發光（材質是 useGltfParts 為這個元件建立的，加上 shader 修改不影響其他模型）
  const nightWindows = props.nightWindows === true;
  useMemo(() => {
    if (nightWindows) for (const p of parts) patchWindowGlow(p.material);
  }, [parts, nightWindows]);
  // Kenney Nature Kit 的大塊平面（樹冠、岩石）放大後接收陰影會出現條紋（shadow acne），只投影不接收
  return <InstancedParts {...props} parts={parts} receiveShadow={!props.model.includes('kenney-nature/')} />;
}

function ProceduralInstanced(props: InstancedProps) {
  // 程式植物的葉片與花瓣是薄面片，接收陰影會產生自我遮蔽的髒斑，因此只投影不接收
  return <InstancedParts {...props} parts={useProceduralParts(props.model)} receiveShadow={false} />;
}

/** 一個區塊：攝影機超過 cullDistance（加上區塊半徑）時整塊隱藏，主畫面與陰影都不畫 */
function ChunkGroup({ placements, cullDistance, children }: { placements: readonly Placement[]; cullDistance: number; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const local = useMemo(() => {
    let x = 0;
    let z = 0;
    for (const p of placements) {
      x += p.position[0];
      z += p.position[2];
    }
    x /= placements.length;
    z /= placements.length;
    let r = 0;
    for (const p of placements) r = Math.max(r, Math.hypot(p.position[0] - x, p.position[2] - z));
    return { x, z, limit: (cullDistance + r + 8) ** 2, since: Infinity };
  }, [placements, cullDistance]);
  useFrame(({ camera }, dt) => {
    local.since += dt;
    if (local.since < CULL_INTERVAL || !ref.current) return;
    local.since = 0;
    const dx = camera.position.x - local.x;
    const dz = camera.position.z - local.z;
    ref.current.visible = dx * dx + dz * dz < local.limit;
  });
  return <group ref={ref}>{children}</group>;
}

function InstancedParts({
  parts,
  placements,
  hidden,
  receiveShadow,
  animate,
  cullDistance = DEFAULT_CULL_DISTANCE,
  castShadow = true,
}: InstancedProps & { parts: Part[]; receiveShadow: boolean }) {
  const chunks = useMemo(() => chunkPlacements(placements), [placements]);
  return (
    <>
      {chunks.map(([chunk, list]) => (
        <ChunkGroup key={chunk} placements={list} cullDistance={cullDistance}>
          {parts.map((part) => (
            <InstancedPart
              key={part.key}
              part={part}
              placements={list}
              hidden={hidden}
              receiveShadow={receiveShadow}
              castShadow={castShadow}
              anim={animate?.find((a) => a.node === part.name)}
            />
          ))}
        </ChunkGroup>
      ))}
    </>
  );
}
