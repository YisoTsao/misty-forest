import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mulberry32 } from '@/game-core/util/random';
import { TERRAIN_SIZE } from '@/game-core/world/terrain';
import { assetUrl } from '@/game/worldData';
import { createMistLook, mistLook, uMist } from '@/render/mist';
import { palette } from '@/render/palette';
import { toonGradient } from '@/render/toon';

/**
 * 遠景（規格 4.3）：遠山 backdrop（程式產生的兩層環狀山脈）與緩慢飄移的雲（KayKit 模型）。
 * - 不參與物理、不屬於世界資料，只是視覺背景。
 * - 不使用場景霧（距離遠超過霧的範圍會整片變成霧色），改以「空氣透視」把顏色混向地平線色；
 *   混合比例跟隨 uMist：晴朗時看得到山的輪廓與顏色，迷霧時幾乎隱沒。
 */

const CLOUD_MODELS = ['models/kaykit-hexagon/cloud_big.gltf', 'models/kaykit-hexagon/cloud_small.gltf'] as const;

/** 雲的飄移速度（公尺 / 秒）與循環範圍 */
const CLOUD_SPEED = 1.6;
const CLOUD_SPAN = 640;

type HazeUniforms = { uHazeColor: { value: THREE.Color }; uHaze: { value: number }; uLift: { value: number } };

/** 遠景材質：toon + 空氣透視混色（取代霧） */
function createBackdropMaterial(source: THREE.Material, haze: HazeUniforms): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ gradientMap: toonGradient(), fog: false });
  if (source instanceof THREE.MeshStandardMaterial) {
    material.color.copy(source.color);
    material.map = source.map;
  }
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, haze);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uHazeColor;\nuniform float uHaze;\nuniform float uLift;')
      .replace(
        '#include <fog_fragment>',
        // uLift：雲用來提亮暗面，保持蓬鬆的白
        'gl_FragColor.rgb = mix(gl_FragColor.rgb + uLift, uHazeColor, uHaze);\n#include <fog_fragment>',
      );
  };
  material.customProgramCacheKey = () => 'backdrop-haze';
  return material;
}

type Part = { geometry: THREE.BufferGeometry; material: THREE.MeshToonMaterial; local: THREE.Matrix4 };

function useParts(models: readonly string[], haze: HazeUniforms): Part[][] {
  const gltfs = useGLTF(models.map((m) => assetUrl(m)));
  const parts = useMemo(
    () =>
      gltfs.map((gltf) => {
        const list: Part[] = [];
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return;
          const source = Array.isArray(obj.material) ? obj.material[0] : obj.material;
          if (!source) return;
          list.push({ geometry: obj.geometry, material: createBackdropMaterial(source, haze), local: obj.matrixWorld.clone() });
        });
        return list;
      }),
    [gltfs, haze],
  );
  useEffect(() => () => parts.flat().forEach((p) => p.material.dispose()), [parts]);
  return parts;
}

type Item = { model: number; x: number; y: number; z: number; yaw: number; scale: number };

/** 依模型分組建立 InstancedMesh（每個模型部件一個 draw call） */
function BackdropInstances({
  parts,
  items,
  matrices,
  moving = false,
}: {
  parts: Part[][];
  items: Item[];
  matrices: THREE.Matrix4[];
  moving?: boolean;
}) {
  const byModel = useMemo(
    () => parts.map((_, modelIndex) => items.flatMap((it, i) => (it.model === modelIndex ? [i] : []))),
    [parts, items],
  );
  return (
    <>
      {parts.map((modelParts, modelIndex) => {
        const indices = byModel[modelIndex]!;
        if (indices.length === 0) return null;
        return modelParts.map((part, partIndex) => (
          <BackdropPart key={`${modelIndex}-${partIndex}`} part={part} matrices={matrices} indices={indices} moving={moving} />
        ));
      })}
    </>
  );
}

const tmp = new THREE.Matrix4();

function writeMatrices(mesh: THREE.InstancedMesh, part: Part, matrices: THREE.Matrix4[], indices: number[]): void {
  indices.forEach((itemIndex, i) => mesh.setMatrixAt(i, tmp.multiplyMatrices(matrices[itemIndex]!, part.local)));
  mesh.instanceMatrix.needsUpdate = true;
}

function BackdropPart({
  part,
  matrices,
  indices,
  moving,
}: {
  part: Part;
  matrices: THREE.Matrix4[];
  indices: number[];
  moving: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (ref.current) writeMatrices(ref.current, part, matrices, indices);
  }, [part, matrices, indices]);
  // 雲會移動：每幀更新矩陣（只有十幾個實例）；山是靜態的
  useFrame(() => {
    if (moving && ref.current) writeMatrices(ref.current, part, matrices, indices);
  });
  return <instancedMesh ref={ref} args={[part.geometry, part.material, indices.length]} frustumCulled={false} />;
}

const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const yAxis = new THREE.Vector3(0, 1, 0);

function composeMatrix(it: Item, out: THREE.Matrix4): THREE.Matrix4 {
  return out.compose(
    tmpPos.set(it.x, it.y, it.z),
    tmpQuat.setFromAxisAngle(yAxis, it.yaw),
    tmpScale.set(it.scale, it.scale * 0.9, it.scale),
  );
}

type RangeLayer = { radius: number; base: number; amplitude: number; sharpness: number; seed: number; bottom: string; top: string };

/** 兩層山脈：近處低矮的綠色丘陵、遠處較高的藍紫色山峰（空氣透視讓遠層更淡） */
const RANGE_LAYERS: RangeLayer[] = [
  { radius: 330, base: 34, amplitude: 70, sharpness: 2.2, seed: 5, bottom: '#7d93b8', top: '#a9bcd8' },
  { radius: 240, base: 14, amplitude: 26, sharpness: 1.4, seed: 9, bottom: '#4f8a5e', top: '#7fb07a' },
];

/** 山脊高度：數個不同頻率的正弦疊加後取次方，做出圓潤但有起伏的稜線 */
function ridgeHeight(theta: number, layer: RangeLayer): number {
  const r = mulberry32(layer.seed);
  let h = 0;
  let weight = 0;
  for (let k = 0; k < 4; k++) {
    const freq = [3, 7, 13, 23][k]!;
    const phase = r() * Math.PI * 2;
    const w = 1 / (k + 1);
    h += (Math.sin(theta * freq + phase) * 0.5 + 0.5) * w;
    weight += w;
  }
  return layer.base + layer.amplitude * (h / weight) ** layer.sharpness;
}

/** 以環狀帶狀網格建立一層山脈；頂點色由下而上漸亮 */
function createRangeGeometry(layer: RangeLayer): THREE.BufferGeometry {
  const segments = 360;
  const bottomY = -30;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const bottom = new THREE.Color(layer.bottom);
  const top = new THREE.Color(layer.top);
  const c = new THREE.Color();
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const h = ridgeHeight(theta, layer);
    const x = Math.cos(theta) * layer.radius;
    const z = Math.sin(theta) * layer.radius;
    positions.push(x, bottomY, z, x, h, z);
    c.copy(bottom);
    colors.push(c.r, c.g, c.b);
    // 越高的峰頂越亮
    c.copy(bottom).lerp(top, 0.55 + 0.45 * Math.min(1, (h - layer.base) / layer.amplitude));
    colors.push(c.r, c.g, c.b);
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

function createRangeMaterial(haze: HazeUniforms): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, haze);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uHazeColor;\nuniform float uHaze;\nuniform float uLift;')
      .replace('#include <fog_fragment>', 'gl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeColor, uHaze);\n#include <fog_fragment>');
  };
  material.customProgramCacheKey = () => 'backdrop-range';
  return material;
}

/**
 * 地圖外的地面延伸：四塊平面圍住地圖（中間挖空），高度低於地圖邊緣的丘陵，
 * 從高處（觀景點）往外看時不會看到地圖與山脈之間的空洞。顏色由內而外漸變到近山的山腳色。
 */
function createSkirtGeometry(): THREE.BufferGeometry {
  const inner = TERRAIN_SIZE / 2 - 1;
  const outer = 400;
  const y = 2;
  const innerColor = new THREE.Color(palette.grassDark);
  const outerColor = new THREE.Color(RANGE_LAYERS[1]!.bottom);
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  // 每一邊：內緣兩點、外緣兩點（梯形），四邊組成中空的方框
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const;
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i]!;
    const [bx, bz] = corners[(i + 1) % 4]!;
    const base = positions.length / 3;
    positions.push(ax * inner, y, az * inner, bx * inner, y, bz * inner, bx * outer, y, bz * outer, ax * outer, y, az * outer);
    for (const c of [innerColor, innerColor, outerColor, outerColor]) colors.push(c.r, c.g, c.b);
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

function GroundSkirt({ haze }: { haze: HazeUniforms }) {
  const geometry = useMemo(() => createSkirtGeometry(), []);
  const material = useMemo(() => createRangeMaterial(haze), [haze]);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  return <mesh geometry={geometry} material={material} />;
}

function MountainRange({ layer, haze }: { layer: RangeLayer; haze: HazeUniforms }) {
  const geometry = useMemo(() => createRangeGeometry(layer), [layer]);
  const material = useMemo(() => createRangeMaterial(haze), [haze]);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  // 畫在天空之後、場景之前；不投射陰影
  return <mesh geometry={geometry} material={material} renderOrder={-0.5} />;
}

function cloudField(): Item[] {
  const rand = mulberry32(777);
  const items: Item[] = [];
  for (let i = 0; i < 14; i++) {
    items.push({
      model: Math.floor(rand() * CLOUD_MODELS.length),
      x: (rand() - 0.5) * CLOUD_SPAN,
      y: 75 + rand() * 45,
      z: (rand() - 0.5) * CLOUD_SPAN,
      yaw: rand() * Math.PI * 2,
      scale: 10 + rand() * 9,
    });
  }
  return items;
}

export function Backdrop() {
  const farHaze = useMemo<HazeUniforms>(
    () => ({ uHazeColor: { value: new THREE.Color() }, uHaze: { value: 0.4 }, uLift: { value: 0 } }),
    [],
  );
  const nearHaze = useMemo<HazeUniforms>(
    () => ({ uHazeColor: { value: new THREE.Color() }, uHaze: { value: 0.2 }, uLift: { value: 0 } }),
    [],
  );
  const cloudHaze = useMemo<HazeUniforms>(
    () => ({ uHazeColor: { value: new THREE.Color() }, uHaze: { value: 0.15 }, uLift: { value: 0.18 } }),
    [],
  );
  const cloudParts = useParts(CLOUD_MODELS, cloudHaze);
  const clouds = useMemo(() => cloudField(), []);
  const cloudMatrices = useMemo(() => clouds.map((c) => composeMatrix(c, new THREE.Matrix4())), [clouds]);
  const look = useMemo(() => createMistLook(), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    mistLook(uMist.value, look);
    const m = uMist.value;
    farHaze.uHazeColor.value.copy(look.skyHorizon);
    farHaze.uHaze.value = THREE.MathUtils.lerp(0.45, 0.98, m);
    nearHaze.uHazeColor.value.copy(look.skyHorizon);
    nearHaze.uHaze.value = THREE.MathUtils.lerp(0.22, 0.95, m);
    cloudHaze.uHazeColor.value.copy(look.skyHorizon);
    cloudHaze.uHaze.value = THREE.MathUtils.lerp(0.12, 0.9, m);

    clouds.forEach((c, i) => {
      c.x += CLOUD_SPEED * dt;
      if (c.x > CLOUD_SPAN / 2) c.x -= CLOUD_SPAN;
      composeMatrix(c, cloudMatrices[i]!);
    });
  });

  return (
    <group>
      <MountainRange layer={RANGE_LAYERS[0]!} haze={farHaze} />
      <MountainRange layer={RANGE_LAYERS[1]!} haze={nearHaze} />
      <GroundSkirt haze={nearHaze} />
      <BackdropInstances parts={cloudParts} items={clouds} matrices={cloudMatrices} moving />
    </group>
  );
}
