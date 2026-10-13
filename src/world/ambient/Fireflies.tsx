import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mulberry32 } from '@/game-core/util/random';
import { boundaryDistance } from '@/game-core/world/bounds';
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

function createGeometry(count: number): THREE.BufferGeometry {
  const rand = mulberry32(5150);
  const base = new Float32Array(MAX_COUNT * 3);
  const seed = new Float32Array(MAX_COUNT);
  const areas = [
    { x: SPAWN_POINT.x, z: SPAWN_POINT.z, r: 30, w: 0.5 },
    { x: LAKE.x, z: LAKE.z, r: 24, w: 0.5 },
  ];
  let n = 0;
  let attempts = 0;
  while (n < MAX_COUNT && attempts++ < 10000) {
    const area = rand() < areas[0]!.w ? areas[0]! : areas[1]!;
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * area.r;
    const x = area.x + Math.cos(a) * r;
    const z = area.z + Math.sin(a) * r;
    if (isUnderwater(x, z, 0.3) || boundaryDistance(x, z) < 3) continue;
    base.set([x, terrainHeight(x, z) + 0.5 + rand() * 1.6, z], n * 3);
    seed[n] = rand() * 100;
    n++;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(base, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geometry.setDrawRange(0, Math.min(count, n));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(15, 0, 12), 60);
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
varying float vBlink;
void main() {
  vec4 tex = texture2D(uMap, gl_PointCoord);
  // HDR 黃綠色，讓 Bloom 產生光暈
  vec3 color = vec3(1.6, 2.2, 0.7);
  gl_FragColor = vec4(color, tex.a * uOpacity * (0.25 + vBlink * 0.75));
}
`;

export function Fireflies() {
  const preset = useQualityPreset();
  const count = Math.min(MAX_COUNT, Math.round(preset.particleBudget * SHARE));
  const geometry = useMemo(() => createGeometry(count), [count]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uScale: { value: 90 },
          uOpacity: { value: 0 },
          uMap: { value: sparkTexture() },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        toneMapped: false,
      }),
    [],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ gl }, dt) => {
    const u = material.uniforms;
    u.uTime!.value += Math.min(dt, 0.1);
    // 點大小以畫面高度換算，不同解析度看起來一樣大
    u.uScale!.value = gl.domElement.height * 0.06;
    u.uOpacity!.value = timeRuntime.night * (1 - uMist.value * 0.8);
  });

  return <points name="fireflies" geometry={geometry} material={material} frustumCulled={false} visible />;
}
