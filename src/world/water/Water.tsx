import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { MAPS, type MapId } from '@/game-core/world/maps';
import { WATER_LEVEL } from '@/game-core/world/terrain';
import { getTerrainGrid, sampleGrid } from '@/game-core/world/terrainGrid';
import { createWaterDepthTexture, createWaterMaterial, waterUniforms } from '@/render/water';

/** 水面網格的格子大小（公尺）：只在地面可能低於水面的格子放水面，避免整張地圖都是透明面 */
const CELL = 4;

/**
 * 水面網格：掃描地形，任一角（或中心）低於水面 + 0.3 m 的格子才放一塊水面。
 * 湖、溪、淺灘自動涵蓋；岸上的部分被地形擋住或由 shader 依水深捨棄。
 */
export function buildWaterGeometry(map: MapId = 'dawnvale'): THREE.BufferGeometry {
  const { origin, size } = MAPS[map];
  const half = size / 2;
  const n = Math.round(size / CELL);
  const positions: number[] = [];
  const indices: number[] = [];
  const grid = getTerrainGrid(map);
  const wet = (x: number, z: number) => sampleGrid(grid, grid.height, x, z) < WATER_LEVEL + 0.3;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x0 = origin.x - half + i * CELL;
      const z0 = origin.z - half + j * CELL;
      const x1 = x0 + CELL;
      const z1 = z0 + CELL;
      if (!(wet(x0, z0) || wet(x1, z0) || wet(x0, z1) || wet(x1, z1) || wet(x0 + CELL / 2, z0 + CELL / 2))) continue;
      const base = positions.length / 3;
      positions.push(x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1);
      indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  // 水面一律朝上
  const normals = new Float32Array(positions.length);
  for (let k = 1; k < normals.length; k += 3) normals[k] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

/** 湖與溪的水面，不參與物理（落水由 Player 判定）。每張地圖各一片（任務 9A 起澄鏡湖也有）。 */
export function Water({ map = 'dawnvale' }: { map?: MapId }) {
  const geometry = useMemo(() => buildWaterGeometry(map), [map]);
  const depthTexture = useMemo(() => createWaterDepthTexture(map), [map]);
  const material = useMemo(() => createWaterMaterial(depthTexture, map), [depthTexture, map]);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      depthTexture.dispose();
    },
    [geometry, material, depthTexture],
  );
  useFrame((_, dt) => {
    // 所有水面共用時間；只在目前的地圖推進（同一時間只會掛一片）
    waterUniforms.uTime.value += Math.min(dt, 0.1);
  });
  return <mesh geometry={geometry} material={material} position={[0, WATER_LEVEL, 0]} renderOrder={1} name={map === 'dawnvale' ? 'water' : `water-${map}`} />;
}
