import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Placement, Prefab } from '@/game-core/world/types';
import { chunkPlacements } from '@/game-core/world/worldData';
import { buildProceduralModel, PROCEDURAL_PREFIX, type ModelPart as Part } from '@/render/proceduralModels';
import { patchOcclusion } from '@/render/occlusion';
import { recolorForPalette } from '@/render/palette';
import { toToonMaterial } from '@/render/toon';
import { assetUrl } from '@/game/worldData';

/** 從 GLB 取出所有 mesh，材質轉為 toon；回傳每個部件與其在模型內的局部矩陣。 */
function useGltfParts(model: string): Part[] {
  const gltf = useGLTF(assetUrl(model));
  const parts = useMemo(() => {
    const list: Part[] = [];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const source = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      if (!source) return;
      // 世界物件會在擋住攝影機時鏤空（render/occlusion.ts）
      const material = toToonMaterial(source);
      recolorForPalette(model, source.name, material.color);
      list.push({ key: obj.uuid, name: obj.name, geometry: obj.geometry, material: patchOcclusion(material), local: obj.matrixWorld.clone() });
    });
    if (list.length === 0) throw new Error(`模型沒有可渲染的 mesh：${model}`);
    return list;
  }, [gltf, model]);

  // toon 材質為本元件建立，需自行釋放；geometry 由 useGLTF 快取持有
  useEffect(() => () => parts.forEach((p) => p.material.dispose()), [parts]);
  return parts;
}

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

function InstancedPart({ part, placements, receiveShadow, anim }: { part: Part; placements: readonly Placement[]; receiveShadow: boolean; anim?: Animation }) {
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
      placementMatrix(p, tmpMatrix).multiply(part.local).multiply(tmpRot.makeRotationAxis(tmpAxis, angle));
      mesh.setMatrixAt(i, tmpMatrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    placements.forEach((p, i) => {
      placementMatrix(p, tmpMatrix).multiply(part.local);
      mesh.setMatrixAt(i, tmpMatrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [part, placements]);

  return <instancedMesh ref={ref} args={[part.geometry, part.material, placements.length]} castShadow receiveShadow={receiveShadow} />;
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

type InstancedProps = { model: string; placements: readonly Placement[]; animate?: Prefab['animate'] };

/**
 * 同一 prefab 的所有 placement 以 InstancedMesh 渲染（規格 4.3、7）。
 * 依位置分成 64 m 的區塊（任務 7A）：每塊一組 InstancedMesh，視錐外的區塊（含陰影）由 three 剔除；
 * 模型的材質與幾何所有區塊共用。
 */
export function InstancedPrefab({ model, placements, animate }: InstancedProps) {
  if (placements.length === 0) return null;
  return model.startsWith(PROCEDURAL_PREFIX) ? (
    <ProceduralInstanced model={model} placements={placements} animate={animate} />
  ) : (
    <GltfInstanced model={model} placements={placements} animate={animate} />
  );
}

function GltfInstanced({ model, placements, animate }: InstancedProps) {
  // Kenney Nature Kit 的大塊平面（樹冠、岩石）放大後接收陰影會出現條紋（shadow acne），只投影不接收
  return <InstancedParts parts={useGltfParts(model)} placements={placements} animate={animate} receiveShadow={!model.includes('kenney-nature/')} />;
}

function ProceduralInstanced({ model, placements, animate }: InstancedProps) {
  // 程式植物的葉片與花瓣是薄面片，接收陰影會產生自我遮蔽的髒斑，因此只投影不接收
  return <InstancedParts parts={useProceduralParts(model)} placements={placements} animate={animate} receiveShadow={false} />;
}

function InstancedParts({
  parts,
  placements,
  receiveShadow,
  animate,
}: {
  parts: Part[];
  placements: readonly Placement[];
  receiveShadow: boolean;
  animate?: Prefab['animate'];
}) {
  const chunks = useMemo(() => chunkPlacements(placements), [placements]);
  return (
    <>
      {chunks.map(([chunk, list]) =>
        parts.map((part) => (
          <InstancedPart
            key={`${chunk}:${part.key}`}
            part={part}
            placements={list}
            receiveShadow={receiveShadow}
            anim={animate?.find((a) => a.node === part.name)}
          />
        )),
      )}
    </>
  );
}
