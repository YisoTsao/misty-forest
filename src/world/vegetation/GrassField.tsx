import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { TERRAIN_SIZE } from '@/game-core/world/terrain';
import { flowerPatchMask, scatterChunk, type VegetationInstance } from '@/game-core/world/vegetation';
import { useQualityPreset } from '@/game/state/settingsStore';
import type { WorldIndex } from '@/game/world/worldIndex';
import {
  createFlowerGeometry,
  createFlowerMaterial,
  createGrassMaterial,
  createGrassTuftGeometry,
  flowerColors,
  vegetationUniforms,
} from '@/render/vegetation';

/** 區塊邊長（公尺）：視錐與距離剔除以區塊為單位 */
const CHUNK = 16;
/** 每隔幾秒重新判斷區塊是否在可見距離內 */
const VISIBILITY_INTERVAL = 0.2;
/** 地圖邊緣抬升成丘陵，最外圈不長草（減少看不到的實例） */
const EDGE_MARGIN = 4;

type Chunk = { center: THREE.Vector3; meshes: THREE.InstancedMesh[] };

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3();
const yAxis = new THREE.Vector3(0, 1, 0);

function buildInstanced(
  list: VegetationInstance[],
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  name: string,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, list.length);
  list.forEach((v, i) => {
    tmpQuat.setFromAxisAngle(yAxis, v.yaw);
    tmpMatrix.compose(tmpPos.set(v.x, v.y, v.z), tmpQuat, tmpScale.setScalar(v.scale));
    mesh.setMatrixAt(i, tmpMatrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.receiveShadow = true;
  mesh.name = name;
  return mesh;
}

/**
 * 草叢與野花（規格 4.3）。以 16 m 區塊建立 InstancedMesh：
 * 視錐外的區塊由 three 剔除，超過可見距離的區塊直接隱藏；區塊內的草花在 shader 中依距離縮入地面。
 * 密度與距離依畫質（規格 4.4）。
 */
export function GrassField({ index }: { index: WorldIndex }) {
  const preset = useQualityPreset();
  const grassGeometry = useMemo(() => createGrassTuftGeometry(), []);
  const flowerGeometry = useMemo(() => createFlowerGeometry(), []);
  const grassMaterial = useMemo(() => createGrassMaterial(), []);
  const flowerMaterial = useMemo(() => createFlowerMaterial(), []);
  const group = useRef<THREE.Group>(null);
  const since = useRef(Infinity);

  const chunks = useMemo<Chunk[]>(() => {
    const list: Chunk[] = [];
    const half = TERRAIN_SIZE / 2 - EDGE_MARGIN;
    const accept = (x: number, z: number) => !index.isOccupied(x, z);
    const palette = flowerColors.map((c) => new THREE.Color(c));
    for (let x0 = -half; x0 < half; x0 += CHUNK) {
      for (let z0 = -half; z0 < half; z0 += CHUNK) {
        const size = Math.min(CHUNK, half - x0, half - z0);
        const grass = scatterChunk(x0, z0, size, {
          density: preset.grassDensity,
          seed: 1,
          accept,
          scale: [0.8, 1.35],
        });
        const flowers = scatterChunk(x0, z0, size, {
          density: preset.flowerDensity,
          seed: 2,
          accept,
          mask: flowerPatchMask,
          variants: flowerColors.length,
          scale: [1.3, 1.9],
        });
        const meshes: THREE.InstancedMesh[] = [];
        if (grass.length > 0) meshes.push(buildInstanced(grass, grassGeometry, grassMaterial, 'grass'));
        if (flowers.length > 0) {
          // 每個區塊有自己的花色屬性，因此複製（很小的）花朵幾何
          const geo = flowerGeometry.clone();
          const colors = new Float32Array(flowers.length * 3);
          flowers.forEach((f, i) => palette[f.variant]!.toArray(colors, i * 3));
          geo.setAttribute('aFlowerColor', new THREE.InstancedBufferAttribute(colors, 3));
          meshes.push(buildInstanced(flowers, geo, flowerMaterial, 'flowers'));
        }
        if (meshes.length > 0) list.push({ center: new THREE.Vector3(x0 + size / 2, 0, z0 + size / 2), meshes });
      }
    }
    return list;
  }, [index, preset.grassDensity, preset.flowerDensity, grassGeometry, flowerGeometry, grassMaterial, flowerMaterial]);

  useEffect(() => {
    const g = group.current;
    if (!g) return;
    for (const c of chunks) g.add(...c.meshes);
    since.current = Infinity;
    return () => {
      for (const c of chunks) {
        g.remove(...c.meshes);
        for (const m of c.meshes) {
          if (m.geometry !== grassGeometry) m.geometry.dispose(); // 花朵的複製幾何
          m.dispose();
        }
      }
    };
  }, [chunks, grassGeometry]);

  useEffect(
    () => () => {
      grassGeometry.dispose();
      flowerGeometry.dispose();
      grassMaterial.dispose();
      flowerMaterial.dispose();
    },
    [grassGeometry, flowerGeometry, grassMaterial, flowerMaterial],
  );

  useFrame(({ camera }, dt) => {
    vegetationUniforms.uTime.value += dt;
    vegetationUniforms.uFadeEnd.value = preset.vegetationDistance;
    vegetationUniforms.uFadeStart.value = preset.vegetationDistance * 0.45;

    since.current += dt;
    if (since.current < VISIBILITY_INTERVAL) return;
    since.current = 0;
    // 區塊中心到攝影機的水平距離超過「可見距離 + 半個對角線」即隱藏
    const limit = (preset.vegetationDistance + CHUNK * 0.71) ** 2;
    for (const c of chunks) {
      const dx = c.center.x - camera.position.x;
      const dz = c.center.z - camera.position.z;
      const visible = dx * dx + dz * dz < limit;
      for (const m of c.meshes) m.visible = visible;
    }
  });

  return <group ref={group} />;
}
