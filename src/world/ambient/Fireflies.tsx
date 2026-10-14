import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mulberry32 } from '@/game-core/util/random';
import { GLOWMOSS_ORIGIN, MOSS_CROWN, STONE_RING } from '@/game-core/world/glowmossTerrain';
import { worldBoundaryDistance } from '@/game-core/world/maps';
import { isUnderwater, LAKE, SPAWN_POINT, terrainHeight } from '@/game-core/world/terrain';
import { useQualityPreset } from '@/game/state/settingsStore';
import { timeRuntime } from '@/game/world/timeRuntime';
import { uMist } from '@/render/mist';
import { sparkTexture } from '@/render/sparkTexture';

/**
 * 夜晚的螢火蟲（GAME_DESIGN 5.2 夜晚生命感）：出生草原與湖岸飄著的小光點。
 * 一個 Points、位置與閃爍都在 shader 內計算（不逐幀改 buffer）；白天與濃霧時淡出。
 * 數量依畫質的粒子預算（低畫質較少）。
 */

/** 螢火蟲佔粒子預算的比例 */
const SHARE = 0.06;
const MAX_COUNT = 200;

type Area = { x: number; z: number; r: number; w: number };
type Swarm = {
  seed: number;
  /** 出現的範圍（w 為權重，總和 1） */
  areas: readonly Area[];
  /** HDR 顏色（讓 Bloom 產生光暈） */
  color: readonly [number, number, number];
  /** 白天的亮度（0 = 只在夜晚出現） */
  dayOpacity: number;
};

/** 晨曦谷地：夜晚出生草原與湖岸的螢火蟲 */
const DAWNVALE_FIREFLIES: Swarm = {
  seed: 5150,
  areas: [
    { x: SPAWN_POINT.x, z: SPAWN_POINT.z, r: 30, w: 0.5 },
    { x: LAKE.x, z: LAKE.z, r: 24, w: 0.5 },
  ],
  color: [1.6, 2.2, 0.7],
  dayOpacity: 0,
};

/** 螢苔祕林：林地裡低密度飄浮的螢光孢子（Bible §6.7 fx_forest_spore_drift），白天也看得到、夜晚更亮 */
const GLOWMOSS_SPORES: Swarm = {
  seed: 6160,
  areas: [
    { x: GLOWMOSS_ORIGIN.x - 20, z: GLOWMOSS_ORIGIN.z + 10, r: 60, w: 0.6 },
    { x: GLOWMOSS_ORIGIN.x + STONE_RING.x, z: GLOWMOSS_ORIGIN.z + STONE_RING.z, r: 14, w: 0.2 },
    { x: GLOWMOSS_ORIGIN.x + MOSS_CROWN.x, z: GLOWMOSS_ORIGIN.z + MOSS_CROWN.z, r: 22, w: 0.2 },
  ],
  color: [0.9, 2.1, 1.5],
  dayOpacity: 0.45,
};

export const SWARMS = { fireflies: DAWNVALE_FIREFLIES, spores: GLOWMOSS_SPORES } as const;

function pickArea(areas: readonly Area[], r: number): Area {
  let acc = 0;
  for (const a of areas) {
    acc += a.w;
    if (r < acc) return a;
  }
  return areas[areas.length - 1]!;
}

function createGeometry(count: number, swarm: Swarm): THREE.BufferGeometry {
  const rand = mulberry32(swarm.seed);
  const base = new Float32Array(MAX_COUNT * 3);
  const seed = new Float32Array(MAX_COUNT);
  let n = 0;
  let attempts = 0;
  let cx = 0;
  let cz = 0;
  while (n < MAX_COUNT && attempts++ < 10000) {
    const area = pickArea(swarm.areas, rand());
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * area.r;
    const x = area.x + Math.cos(a) * r;
    const z = area.z + Math.sin(a) * r;
    if (isUnderwater(x, z, 0.3) || worldBoundaryDistance(x, z) < 3) continue;
    base.set([x, terrainHeight(x, z) + 0.5 + rand() * 1.6, z], n * 3);
    seed[n] = rand() * 100;
    cx += x;
    cz += z;
    n++;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(base, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geometry.setDrawRange(0, Math.min(count, n));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx / Math.max(n, 1), 0, cz / Math.max(n, 1)), 90);
  return geometry;
}

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uScale;
attribute float aSeed;
varying float vBlink;
void main() {
  vec3 p = position;
  float t = uTime * 0.6 + aSeed;
  // 緩慢的漂移：三個方向不同頻率，看起來像亂飛但不會跑遠
  p += vec3(sin(t * 0.9) * 0.9, sin(t * 1.3 + aSeed) * 0.35, cos(t * 0.7) * 0.9);
  vBlink = smoothstep(0.15, 0.9, 0.5 + 0.5 * sin(uTime * (1.6 + fract(aSeed) * 1.4) + aSeed * 7.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uScale * (0.6 + vBlink * 0.6) / -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D uMap;
uniform float uOpacity;
uniform vec3 uColor;
varying float vBlink;
void main() {
  vec4 tex = texture2D(uMap, gl_PointCoord);
  // HDR 色，讓 Bloom 產生光暈
  gl_FragColor = vec4(uColor, tex.a * uOpacity * (0.25 + vBlink * 0.75));
}
`;

/** 夜晚的螢火蟲（晨曦谷地）或林地的螢光孢子（螢苔祕林）：kind 選擇設定 */
export function Fireflies({ kind = 'fireflies' }: { kind?: keyof typeof SWARMS }) {
  const swarm = SWARMS[kind];
  const preset = useQualityPreset();
  const count = Math.min(MAX_COUNT, Math.round(preset.particleBudget * SHARE));
  const geometry = useMemo(() => createGeometry(count, swarm), [count, swarm]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uScale: { value: 90 },
          uOpacity: { value: 0 },
          uMap: { value: sparkTexture() },
          uColor: { value: new THREE.Vector3(...swarm.color) },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        toneMapped: false,
      }),
    [swarm],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ gl }, dt) => {
    const u = material.uniforms;
    u.uTime!.value += Math.min(dt, 0.1);
    // 點大小以畫面高度換算，不同解析度看起來一樣大
    u.uScale!.value = gl.domElement.height * 0.06;
    const lit = swarm.dayOpacity + (1 - swarm.dayOpacity) * timeRuntime.night;
    u.uOpacity!.value = lit * (1 - uMist.value * 0.8);
  });

  return <points name={kind} geometry={geometry} material={material} frustumCulled={false} visible />;
}
