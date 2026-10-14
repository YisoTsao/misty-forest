import * as THREE from 'three';
import { patchMist } from './mist';
import { palette } from './palette';
import { toonGradient } from './toon';

/**
 * 流動的水（任務 8C：修好的古水渠與木槽）。幾何帶有 aArc 屬性（沿水流方向的距離，公尺），
 * shader 以此畫出往下游流動的水紋，並捨棄 uReach 之後的部分：水「流到哪裡」由 uReach 決定，
 * 調大 uReach 就像水往前推進。aAcross 為橫向位置（-1 到 1），兩側邊緣畫上淺色水沫。
 */
export type FlowWaterUniforms = { uTime: { value: number }; uReach: { value: number } };

export function createFlowWaterMaterial(): { material: THREE.MeshToonMaterial; uniforms: FlowWaterUniforms } {
  const material = new THREE.MeshToonMaterial({ gradientMap: toonGradient(), color: '#ffffff', transparent: true, opacity: 0.88, depthWrite: false, side: THREE.DoubleSide });
  const uniforms = {
    uTime: { value: 0 },
    uReach: { value: 0 },
    uDeep: { value: new THREE.Color(palette.waterDeep) },
    uShallow: { value: new THREE.Color(palette.waterShallow) },
    uFoam: { value: new THREE.Color(palette.waterFoam) },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aArc;\nattribute float aAcross;\nvarying float vArc;\nvarying float vAcross;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvArc = aArc;\nvAcross = aAcross;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uReach;
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        uniform vec3 uFoam;
        varying float vArc;
        varying float vAcross;
        float fHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float fNoise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(fHash(i), fHash(i + vec2(1, 0)), u.x), mix(fHash(i + vec2(0, 1)), fHash(i + vec2(1, 1)), u.x), u.y);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          if (vArc > uReach) discard;
          float edge = abs(vAcross);
          vec3 col = mix(uDeep, uShallow, smoothstep(0.2, 0.95, edge));
          // 往下游流動的細長水紋
          float n = fNoise(vec2(vArc * 0.45 - uTime * 1.6, vAcross * 3.0));
          float m = fNoise(vec2(vArc * 1.1 - uTime * 2.3, vAcross * 6.0 + 4.0));
          col = mix(col, uShallow * 1.3, smoothstep(0.62, 0.8, n) * 0.55 + smoothstep(0.72, 0.86, m) * 0.35);
          // 兩岸與水流最前端的白色水沫
          float front = 1.0 - smoothstep(0.0, 1.6, uReach - vArc);
          float foam = smoothstep(0.82, 1.0, edge) * step(0.4, fNoise(vec2(vArc * 2.0 - uTime * 2.0, vAcross)));
          col = mix(col, uFoam, clamp(max(foam * 0.7, front * 0.8), 0.0, 1.0));
          diffuseColor.rgb *= col;
        }`,
      )
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
  };
  material.customProgramCacheKey = () => 'flow-water';
  return { material: patchMist(material), uniforms };
}

/** 沿折線建立水帶（點為 [x, y, z]，世界座標）：寬 halfWidth × 2，帶 aArc / aAcross 屬性 */
export function buildFlowRibbon(points: readonly (readonly [number, number, number])[], halfWidth: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const arcs: number[] = [];
  const across: number[] = [];
  const indices: number[] = [];
  let arc = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    if (i > 0) arc += Math.hypot(p[0] - points[i - 1]![0], p[1] - points[i - 1]![1], p[2] - points[i - 1]![2]);
    // 轉角處的切線取前後兩段的平均
    const a = points[Math.max(0, i - 1)]!;
    const b = points[Math.min(points.length - 1, i + 1)]!;
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    positions.push(p[0] + nx * halfWidth, p[1], p[2] + nz * halfWidth, p[0] - nx * halfWidth, p[1], p[2] - nz * halfWidth);
    arcs.push(arc, arc);
    across.push(1, -1);
    if (i > 0) {
      const k = (i - 1) * 2;
      indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({ length: positions.length / 3 }, () => [0, 1, 0]).flat(), 3));
  geo.setAttribute('aArc', new THREE.Float32BufferAttribute(arcs, 1));
  geo.setAttribute('aAcross', new THREE.Float32BufferAttribute(across, 1));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}
