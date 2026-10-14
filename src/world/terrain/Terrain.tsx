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
  const p = pos.array as Float32Array;
  const n = grid.size;
  // 到小路中心的距離：地形 shader 以此計算泥土路的 splat 權重
  const pathDist = new Float32Array(pos.count);
  // 法線直接由取樣格的中央差分計算（與 computeVertexNormals 結果相近，但不必走過 20 萬個三角形）
  const normals = new Float32Array(pos.count * 3);
  const half = TERRAIN_SIZE / 2;
  const h = (i: number, j: number) => grid.height[Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))]!;
  for (let v = 0; v < pos.count; v++) {
    const i = Math.round((p[v * 3]! + half) / grid.step);
    const j = Math.round((p[v * 3 + 2]! + half) / grid.step);
    p[v * 3 + 1] = grid.height[j * n + i]!;
    pathDist[v] = grid.pathDist[j * n + i]!;
    const dx = (h(i + 1, j) - h(i - 1, j)) / (2 * grid.step);
    const dz = (h(i, j + 1) - h(i, j - 1)) / (2 * grid.step);
    const len = Math.hypot(dx, 1, dz);
    normals[v * 3] = -dx / len;
    normals[v * 3 + 1] = 1 / len;
    normals[v * 3 + 2] = -dz / len;
  }

  geo.setAttribute('aPathDist', new THREE.BufferAttribute(pathDist, 1));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.computeBoundingSphere();
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
