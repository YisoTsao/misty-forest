import { useFrame, useThree } from '@react-three/fiber';
import { useRapier, type RapierCollider } from '@react-three/rapier';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { boundaryOutline } from '@/game-core/world/bounds';
import { terrainHeight } from '@/game-core/world/terrain';
import { currentInterior } from '@/game/location';
import { playerRuntime } from '@/game/player/localRuntime';
import { currentScreen } from '@/game/state/gameStore';
import { cameraIgnoredColliders } from '@/game/world/cameraIgnore';
import { boundaryRuntime, resetBoundaryWarning, updateBoundaryWarning } from '@/game/world/boundaryRuntime';

/**
 * 地圖邊界（GAME_DESIGN 5.1、決策 G-05）：
 * - 可玩區外緣一圈靜態方塊碰撞，擋住角色；不參與攝影機避讓（同 T-62 欄杆）。
 * - 視覺上是一道隨霧色變化、玩家越靠近越濃的迷霧牆，不是看不出原因的隱形牆。
 */

/** 碰撞牆的半厚度：中心線往外推同樣距離，內側面剛好落在邊界上 */
const WALL_HALF_THICKNESS = 1;
/** 碰撞牆往地面上下延伸的範圍 */
const WALL_HALF_HEIGHT = 20;

export function BoundaryColliders() {
  const { world, rapier } = useRapier();
  useEffect(() => {
    const points = boundaryOutline(6, 6, WALL_HALF_THICKNESS);
    const colliders: RapierCollider[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i]!;
      const b = points[(i + 1) % points.length]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      // 局部 X 對齊這一段；繞 Y 轉 θ 時 (1,0,0) → (cosθ, 0, −sinθ)
      const half = Math.atan2(-dz, dx) / 2;
      const desc = rapier.ColliderDesc.cuboid(len / 2 + 0.6, WALL_HALF_HEIGHT, WALL_HALF_THICKNESS)
        .setTranslation(mx, terrainHeight(mx, mz) + 5, mz)
        .setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) });
      const collider = world.createCollider(desc);
      cameraIgnoredColliders.add(collider.handle);
      colliders.push(collider);
    }
    boundaryRuntime.colliders = colliders.length;
    return () => {
      for (const c of colliders) {
        cameraIgnoredColliders.delete(c.handle);
        // Physics 可能已先卸載，此時 world 已釋放
        if (world.getCollider(c.handle)) world.removeCollider(c, false);
      }
      boundaryRuntime.colliders = 0;
    };
  }, [world, rapier]);
  return null;
}

const WATCH_INTERVAL = 0.25;

/** 每 0.25 秒檢查玩家離邊界多近，進入提示範圍時顯示提示（遊玩中、戶外才判斷）。 */
export function BoundaryWatcher() {
  const local = useMemo(() => ({ since: 0 }), []);
  useFrame((_, dt) => {
    local.since += dt;
    if (local.since < WATCH_INTERVAL) return;
    local.since = 0;
    if (currentScreen() !== 'playing' || currentInterior()) {
      resetBoundaryWarning();
      return;
    }
    updateBoundaryWarning(playerRuntime.position.x, playerRuntime.position.z, performance.now() / 1000);
  });
  return null;
}

/** 迷霧牆高度（從地面往上） */
const MIST_HEIGHT = 30;
/** 往地面下延伸，避免起伏地形在牆腳露出縫隙 */
const MIST_DEPTH = 3;

function createMistWallGeometry(): THREE.BufferGeometry {
  const points = boundaryOutline(3, 8, 0.5);
  const n = points.length + 1; // 首尾各一列頂點，u 才能連續
  const positions = new Float32Array(n * 2 * 3);
  const uvs = new Float32Array(n * 2 * 2);
  let u = 0;
  for (let i = 0; i < n; i++) {
    const p = points[i % points.length]!;
    if (i > 0) {
      const prev = points[i - 1]!;
      u += Math.hypot(p.x - prev.x, p.z - prev.z);
    }
    const ground = terrainHeight(p.x, p.z);
    positions.set([p.x, ground - MIST_DEPTH, p.z, p.x, ground + MIST_HEIGHT, p.z], i * 6);
    uvs.set([u, 0, u, 1], i * 4);
  }
  const index: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return geometry;
}

const vertexShader = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform vec2 uPlayer;
varying vec2 vUv;
varying vec3 vWorld;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main() {
  // 牆腳最濃、往上漸淡；噪聲緩慢向上捲動，像不斷湧出的霧
  float height = clamp(vUv.y, 0.0, 1.0);
  float vertical = 1.0 - smoothstep(0.08, 0.62, height);
  vec2 q = vec2(vUv.x * 0.07 + uTime * 0.025, vWorld.y * 0.08 - uTime * 0.06);
  float n = fbm(q + fbm(q * 1.7 + uTime * 0.02));
  float alpha = vertical * (0.5 + 0.55 * n);
  // 玩家靠近的那一段更濃，提示「前面過不去」
  float near = 1.0 - smoothstep(4.0, 32.0, distance(vWorld.xz, uPlayer));
  alpha = clamp(alpha + near * vertical * 0.3, 0.0, 0.86);
  // 攝影機穿過牆時不要整個畫面糊掉；遠處稍微變薄，低空的太陽與月亮看得到
  float camDist = distance(vWorld, cameraPosition);
  alpha *= smoothstep(0.8, 4.0, camDist) * mix(1.0, 0.65, smoothstep(40.0, 130.0, camDist));
  // 比霧色更白、明暗起伏更明顯，才看得出是一團團湧動的濃霧，而不是和天空融成一片
  vec3 color = mix(uColor, vec3(1.0), 0.42) * (0.76 + 0.4 * n);
  gl_FragColor = vec4(color, alpha);
}
`;

export function MistWall() {
  const scene = useThree((s) => s.scene);
  const geometry = useMemo(() => createMistWallGeometry(), []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color() },
          uTime: { value: 0 },
          uPlayer: { value: new THREE.Vector2() },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    [],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame((_, dt) => {
    const u = material.uniforms;
    // 霧色已跟隨迷霧（與之後的時段），牆用同一個顏色才會和遠景融在一起
    if (scene.fog) u.uColor!.value.copy(scene.fog.color);
    u.uTime!.value += dt;
    u.uPlayer!.value.set(playerRuntime.position.x, playerRuntime.position.z);
  });

  return <mesh name="boundary-mist-wall" geometry={geometry} material={material} renderOrder={2} />;
}
