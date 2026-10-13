import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { LAKE, WATER_LEVEL } from '@/game-core/world/terrain';
import { createWaterMaterial, waterUniforms } from '@/render/water';

/** 湖面：略大於湖岸的圓盤（岸邊以外被地形蓋住），不參與物理（落水由 Player 判定）。 */
export function Lake() {
  const geometry = useMemo(() => new THREE.CircleGeometry(LAKE.radius + 0.8, 96).rotateX(-Math.PI / 2), []);
  const material = useMemo(() => createWaterMaterial(), []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  useFrame((_, dt) => {
    waterUniforms.uTime.value += Math.min(dt, 0.1);
  });
  return <mesh geometry={geometry} material={material} position={[LAKE.x, WATER_LEVEL, LAKE.z]} renderOrder={1} />;
}
