import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { timeRuntime } from '@/game/world/timeRuntime';
import { createMistLook, mistLook, uMist } from '@/render/mist';
import { palette } from '@/render/palette';

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  uniform vec3 uMoonDir;
  uniform vec3 uSunColor;
  uniform float uSunVis;
  uniform float uMoonVis;
  uniform float uMoonPhase;
  uniform float uStars;
  uniform float uGlow;
  uniform float uTime;
  varying vec3 vDir;

  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

  void main() {
    vec3 dir = normalize(vDir);
    float h = clamp(dir.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));

    // 日出日落：太陽方向的地平線一帶暖色光暈
    vec2 flatDir = normalize(dir.xz + 1e-5);
    vec2 sunFlat = normalize(uSunDir.xz + 1e-5);
    float toward = max(dot(flatDir, sunFlat), 0.0);
    col += uSunColor * pow(toward, 3.0) * pow(1.0 - h, 4.0) * uGlow * 0.55;

    // 星空：方向量化成格子，每格一顆、隨機亮度與閃爍；靠近地平線淡出
    if (uStars > 0.001) {
      vec3 cell = floor(dir * 140.0);
      float r = hash(cell);
      if (r > 0.985) {
        vec3 f = fract(dir * 140.0) - 0.5;
        float d = length(f);
        float twinkle = 0.6 + 0.4 * sin(uTime * (1.5 + r * 4.0) + r * 60.0);
        float star = smoothstep(0.32, 0.0, d) * (0.4 + 0.6 * hash(cell + 7.0)) * twinkle;
        col += vec3(0.85, 0.9, 1.0) * star * uStars * smoothstep(0.02, 0.25, dir.y) * 1.6;
      }
    }

    // 太陽：圓盤 + 兩層光暈（HDR，觸發 Bloom）
    float sd = dot(dir, normalize(uSunDir));
    float sunDisk = smoothstep(0.99935, 0.9996, sd);
    float sunGlow = pow(max(sd, 0.0), 220.0) * 0.9 + pow(max(sd, 0.0), 18.0) * 0.18;
    col += uSunColor * (sunDisk * 3.0 + sunGlow) * uSunVis;

    // 月亮：圓盤（依月相被陰影圓遮住一部分）+ 淡淡的光暈
    vec3 md = normalize(uMoonDir);
    float mdot = dot(dir, md);
    float moonR = 0.028;
    if (mdot > 0.99) {
      vec3 up = abs(md.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
      vec3 right = normalize(cross(up, md));
      vec3 top = cross(md, right);
      vec2 uv = vec2(dot(dir, right), dot(dir, top)) / moonR;
      float disk = smoothstep(1.0, 0.9, length(uv));
      // 月相：0 = 滿月（陰影圓移到很遠）、0.5 = 新月（陰影圓蓋住）；前半月與後半月陰影在不同側
      float waxing = uMoonPhase < 0.5 ? 1.0 : -1.0;
      float shift = abs(1.0 - 2.0 * uMoonPhase) * 2.2 * waxing;
      float shadow = smoothstep(1.0, 0.9, length(uv - vec2(shift, 0.0)));
      float lit = disk * (1.0 - shadow * 0.92);
      // 月面的淡淡斑紋
      float mare = 0.85 + 0.15 * hash(floor(vec3(uv * 4.0, 1.0)));
      col = mix(col, vec3(1.25, 1.3, 1.45) * mare, lit * uMoonVis);
    }
    col += vec3(0.55, 0.65, 0.95) * pow(max(mdot, 0.0), 160.0) * 0.35 * uMoonVis;

    // 地平線下方延續地平線色，與霧融合
    col = dir.y < 0.0 ? uHorizon : col;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * 風格化漸層天空球（規格 4.3）。固定跟隨相機，不參與物理；顏色跟隨 uMist 與時段。
 * 太陽、月亮（含月相）、星空都在同一個 shader 內（GAME_DESIGN 5.2：不增加 draw call）。
 */
export function Sky() {
  const ref = useRef<THREE.Mesh>(null);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uZenith: { value: new THREE.Color(palette.skyZenith) },
          uHorizon: { value: new THREE.Color(palette.skyHorizon) },
          uSunDir: { value: new THREE.Vector3(0, 1, 0) },
          uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
          uSunColor: { value: new THREE.Color(palette.sun) },
          uSunVis: { value: 1 },
          uMoonVis: { value: 0 },
          uMoonPhase: { value: 0 },
          uStars: { value: 0 },
          uGlow: { value: 0 },
          uTime: { value: 0 },
        },
        vertexShader,
        fragmentShader,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    [],
  );

  useEffect(() => () => material.dispose(), [material]);
  const look = useMemo(() => createMistLook(), []);
  const sunColor = useMemo(() => new THREE.Color(), []);

  useFrame(({ camera }, dt) => {
    ref.current?.position.copy(camera.position);
    // 迷霧時天空轉灰並與霧色融合（規格 4.5）；時段由 Lighting 先更新
    mistLook(uMist.value, look);
    const u = material.uniforms;
    (u.uZenith!.value as THREE.Color).copy(look.skyZenith);
    (u.uHorizon!.value as THREE.Color).copy(look.skyHorizon);
    const { sun, moon } = timeRuntime;
    (u.uSunDir!.value as THREE.Vector3).set(sun.x, sun.y, sun.z);
    (u.uMoonDir!.value as THREE.Vector3).set(moon.x, moon.y, moon.z);
    // 太陽顏色取時段光色（不含迷霧的灰），迷霧時圓盤一起淡出
    (u.uSunColor!.value as THREE.Color).copy(sunColor.copy(look.sunColor).lerp(look.skyHorizon, 0.2));
    const clearSky = 1 - uMist.value * 0.85;
    u.uSunVis!.value = smoothstep(-0.03, 0.04, sun.elevation) * clearSky;
    u.uMoonVis!.value = smoothstep(-0.03, 0.06, moon.elevation) * clearSky * (0.35 + 0.65 * timeRuntime.night);
    u.uMoonPhase!.value = timeRuntime.moonPhase;
    u.uStars!.value = look.stars;
    u.uGlow!.value = look.glow;
    u.uTime!.value += Math.min(dt, 0.1);
  });

  return (
    <mesh ref={ref} material={material} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[450, 32, 16]} />
    </mesh>
  );
}
