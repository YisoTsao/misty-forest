import { useGLTF } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Placement } from '@/game-core/world/types';
import { toToonMaterial } from '@/render/toon';
import { assetUrl } from '@/game/worldData';

type Part = { key: string; geometry: THREE.BufferGeometry; material: THREE.Material; local: THREE.Matrix4 };

/** 從 GLB 取出所有 mesh，材質轉為 toon；回傳每個部件與其在模型內的局部矩陣。 */
function useModelParts(model: string): Part[] {
  const gltf = useGLTF(assetUrl(model));
  const parts = useMemo(() => {
    const list: Part[] = [];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const source = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      if (!source) return;
      list.push({ key: obj.uuid, geometry: obj.geometry, material: toToonMaterial(source), local: obj.matrixWorld.clone() });
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

function InstancedPart({ part, placements }: { part: Part; placements: readonly Placement[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);

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

  return <instancedMesh ref={ref} args={[part.geometry, part.material, placements.length]} castShadow receiveShadow />;
}

/** 同一 prefab 的所有 placement 以 InstancedMesh 渲染（規格 4.3、7）。 */
export function InstancedPrefab({ model, placements }: { model: string; placements: readonly Placement[] }) {
  const parts = useModelParts(model);
  return (
    <>
      {parts.map((part) => (
        <InstancedPart key={part.key} part={part} placements={placements} />
      ))}
    </>
  );
}
