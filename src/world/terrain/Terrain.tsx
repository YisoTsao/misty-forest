import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { TERRAIN_SIZE } from '@/game-core/world/terrain';
import { getTerrainGrid } from '@/game-core/world/terrainGrid';
import { createTerrainMaterial } from '@/render/terrainMaterial';

function buildTerrainGeometry(): THREE.BufferGeometry {
  // 頂點與共用的地形取樣格一一對應（1 m 一點），不必再呼叫 terrainHeight
  const grid = getTerrainGrid();
  const segments = grid.size - 1;
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  // 到小路中心的距離：地形 shader 以此計算泥土路的 splat 權重
  const pathDist = new Float32Array(pos.count);
  const half = TERRAIN_SIZE / 2;
  for (let v = 0; v < pos.count; v++) {
    const i = Math.round((pos.getX(v) + half) / grid.step);
    const j = Math.round((pos.getZ(v) + half) / grid.step);
    pos.setY(v, grid.height[j * grid.size + i]!);
    pathDist[v] = grid.pathDist[j * grid.size + i]!;
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
