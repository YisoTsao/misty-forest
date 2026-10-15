import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { MapId } from '@/game-core/world/maps';
import { WATER_LEVEL } from '@/game-core/world/terrain';
import { getTerrainGrid, sampleGrid } from '@/game-core/world/terrainGrid';
import { flowerPatchMask, scatterChunk, type VegetationInstance } from '@/game-core/world/vegetation';
import { currentMap } from '@/game/location';
import { useQualityPreset } from '@/game/state/settingsStore';
import type { WorldIndex } from '@/game/world/worldIndex';
import {
  createFlowerGeometry,
  createFlowerMaterial,
  createGrassMaterial,
  createGrassTuftGeometry,
  flowerColors,
  forestFlowerColors,
  vegetationUniforms,
} from '@/render/vegetation';

/** 區塊邊長（公尺）：視錐與距離剔除以區塊為單位 */
const CHUNK = 16;
/** 每隔幾秒重新判斷區塊是否在可見距離內 */
const VISIBILITY_INTERVAL = 0.2;
/** 地圖邊緣抬升成丘陵，最外圈不長草（減少看不到的實例） */
const EDGE_MARGIN = 4;

/** 區塊：位置先算好，草花網格在攝影機第一次靠近時才建立（任務 7A：地圖 320 m，啟動時全部散佈要好幾秒） */
type Chunk = { x0: number; z0: number; size: number; center: THREE.Vector3; meshes: THREE.InstancedMesh[] | null };
/** 每幀最多建立幾個區塊（攝影機跳到遠處時分散到幾幀） */
const BUILDS_PER_FRAME = 4;

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
 * 草叢與野花（規格 4.3）。以 16 m 區塊建立 InstancedMesh（攝影機第一次靠近時才建立）：
 * 視錐外的區塊由 three 剔除，超過可見距離的區塊直接隱藏；區塊內的草花在 shader 中依距離縮入地面。
 * 密度與距離依畫質（規格 4.4）。
 */
export function GrassField({ index, map = 'dawnvale' }: { index: WorldIndex; map?: MapId }) {
  const preset = useQualityPreset();
  const grassGeometry = useMemo(() => createGrassTuftGeometry(), []);
  const flowerGeometry = useMemo(() => createFlowerGeometry(), []);
  const grassMaterial = useMemo(() => createGrassMaterial(map), [map]);
  const flowerMaterial = useMemo(() => createFlowerMaterial(map), [map]);
  const grid = getTerrainGrid(map);
  const group = useRef<THREE.Group>(null);
  const since = useRef(Infinity);

  // 區塊只先算位置；網格在攝影機靠近時才建立（buildChunk）
  const chunks = useMemo<Chunk[]>(() => {
    const list: Chunk[] = [];
    const half = grid.extent / 2 - EDGE_MARGIN;
    for (let lx = -half; lx < half; lx += CHUNK) {
      for (let lz = -half; lz < half; lz += CHUNK) {
        const size = Math.min(CHUNK, half - lx, half - lz);
        const x0 = grid.originX + lx;
        const z0 = grid.originZ + lz;
        list.push({ x0, z0, size, center: new THREE.Vector3(x0 + size / 2, 0, z0 + size / 2), meshes: null });
      }
    }
    return list;
  }, [grid]);

  const buildChunk = useMemo(() => {
    const heightAt = (x: number, z: number) => sampleGrid(grid, grid.height, x, z);
    const pathDistAt = (x: number, z: number) => sampleGrid(grid, grid.pathDist, x, z);
    // 湖裡、溪裡與水邊不長草
    const accept = (x: number, z: number) => heightAt(x, z) >= WATER_LEVEL + 0.25 && !index.isOccupied(x, z);
    const colors: readonly string[] = map === 'glowmoss' ? forestFlowerColors : flowerColors;
    const palette = colors.map((c) => new THREE.Color(c));
    // 林下比草原暗：花少一些；風語草原是大片野花坡（Bible §8.2）
    const flowerDensity = preset.flowerDensity * (map === 'glowmoss' ? 0.35 : map === 'whispermeadow' ? 1.6 : 1);
    return (c: Chunk): THREE.InstancedMesh[] => {
      const grass = scatterChunk(c.x0, c.z0, c.size, { density: preset.grassDensity, seed: 1, accept, scale: [0.8, 1.35], heightAt, pathDistAt });
      const flowers = scatterChunk(c.x0, c.z0, c.size, {
        density: flowerDensity,
        seed: 2,
        accept,
        mask: flowerPatchMask,
        variants: colors.length,
        scale: [1.3, 1.9],
        heightAt,
        pathDistAt,
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
      return meshes;
    };
  }, [index, grid, map, preset.grassDensity, preset.flowerDensity, grassGeometry, flowerGeometry, grassMaterial, flowerMaterial]);

  useEffect(() => {
    const g = group.current;
    since.current = Infinity;
    return () => {
      for (const c of chunks) {
        if (!c.meshes) continue;
        g?.remove(...c.meshes);
        for (const m of c.meshes) {
          if (m.geometry !== grassGeometry) m.geometry.dispose(); // 花朵的複製幾何
          m.dispose();
        }
        c.meshes = null;
      }
    };
    // 畫質改變（密度不同，buildChunk 換新）時清掉已建立的區塊，之後依新密度重建
  }, [buildChunk, chunks, grassGeometry]);

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
    // 風與淡出的 uniform 所有地圖共用：只由所在地圖的草地更新（否則每幀會加兩次時間）
    if (currentMap() === map) {
      vegetationUniforms.uTime.value += dt;
      vegetationUniforms.uFadeEnd.value = preset.vegetationDistance;
      vegetationUniforms.uFadeStart.value = preset.vegetationDistance * 0.45;
    }

    since.current += dt;
    if (since.current < VISIBILITY_INTERVAL) return;
    since.current = 0;
    const g = group.current;
    if (!g) return;
    // 區塊中心到攝影機的水平距離超過「可見距離 + 半個對角線」即隱藏；第一次進入範圍時建立（由近到遠，每次最多幾塊）
    const limit = (preset.vegetationDistance + CHUNK * 0.71) ** 2;
    const toBuild: { c: Chunk; d: number }[] = [];
    for (const c of chunks) {
      const dx = c.center.x - camera.position.x;
      const dz = c.center.z - camera.position.z;
      const d = dx * dx + dz * dz;
      const visible = d < limit;
      if (visible && !c.meshes) toBuild.push({ c, d });
      if (c.meshes) for (const m of c.meshes) m.visible = visible;
    }
    toBuild.sort((a, b) => a.d - b.d);
    for (const { c } of toBuild.slice(0, BUILDS_PER_FRAME)) {
      c.meshes = buildChunk(c);
      if (c.meshes.length > 0) g.add(...c.meshes);
    }
    // 還有沒建完的就下一幀繼續
    if (toBuild.length > BUILDS_PER_FRAME) since.current = VISIBILITY_INTERVAL;
  });

  return <group ref={group} />;
}
