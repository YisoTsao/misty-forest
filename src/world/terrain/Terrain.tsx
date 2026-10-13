import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { distanceToPath, TERRAIN_SIZE, terrainHeight } from '@/game-core/world/terrain';
import { createTerrainMaterial } from '@/render/terrainMaterial';

const SEGMENTS = 160;

function buildTerrainGeometry(): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  // 到小路中心的距離：地形 shader 以此計算泥土路的 splat 權重
  const pathDist = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, terrainHeight(x, z));
    pathDist[i] = distanceToPath(x, z);
  }

  geo.setAttribute('aPathDist', new THREE.BufferAttribute(pathDist, 1));
  geo.computeVertexNormals();
  return geo;
}

/** 碰撞用的頂點與索引，與渲染網格完全一致。 */
function trimeshArgs(geo: THREE.BufferGeometry): [Float32Array, Uint32Array] {
  const index = geo.index;
  if (!index) throw new Error('地形網格缺少索引');
  return [new Float32Array(geo.attributes.position!.array), Uint32Array.from(index.array)];
}

/** 地形：渲染網格 + 固定剛體 trimesh 碰撞（須放在 <Physics> 內）。 */
export function Terrain() {
  const geometry = useMemo(() => buildTerrainGeometry(), []);
  const material = useMemo(() => createTerrainMaterial(), []);
  const colliderArgs = useMemo(() => trimeshArgs(geometry), [geometry]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  return (
    <>
      <mesh geometry={geometry} material={material} receiveShadow />
      <RigidBody type="fixed" colliders={false}>
        <TrimeshCollider args={colliderArgs} friction={1} />
      </RigidBody>
    </>
  );
}
