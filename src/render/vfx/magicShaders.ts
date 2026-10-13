import * as THREE from 'three';

/**
 * 魔法陣與衝擊波（GAME_DESIGN 5.4）：程式產生的 shader，平貼地面的方形網格，加法混合、HDR 顏色。
 * - 魔法陣：外圈雙環、反向旋轉的符文刻度、六芒星、內圈；uProgress 控制展開，uFade 控制淡出。
 * - 衝擊波：由內往外擴散的光環，邊緣有噪聲擾動，越外越淡。
 */

const planeVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const circleFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uProgress;
uniform float uFade;
varying vec2 vUv;

#define PI 3.14159265

float ring(float r, float center, float width) {
  return smoothstep(width, 0.0, abs(r - center));
}

float hash(float n) { return fract(sin(n) * 43758.5453); }

/** 點到線段的距離 */
float segment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

vec2 rotate(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

void main() {
  // 展開：從中心長出來（半徑以外的部分還看不到）
  vec2 p = (vUv * 2.0 - 1.0) / max(uProgress, 0.001);
  float r = length(p);
  if (r > 1.02) discard;

  float a = 0.0;
  // 外圈雙環
  a += ring(r, 0.96, 0.025) * 1.2;
  a += ring(r, 0.88, 0.012);
  // 符文刻度：順時針旋轉，長短不一
  vec2 q = rotate(p, uTime * 0.6);
  float ang = atan(q.y, q.x);
  float seg = floor((ang + PI) / (2.0 * PI) * 36.0);
  float within = fract((ang + PI) / (2.0 * PI) * 36.0);
  float len = 0.04 + 0.05 * hash(seg);
  a += step(0.25, within) * step(within, 0.75) * smoothstep(0.012, 0.0, abs(r - 0.79) - len) * 0.9;
  // 內圈：逆時針旋轉的虛線環
  vec2 q2 = rotate(p, -uTime * 1.1);
  float ang2 = atan(q2.y, q2.x);
  a += ring(r, 0.58, 0.014) * step(0.35, fract((ang2 + PI) / (2.0 * PI) * 18.0));
  // 六芒星：兩個三角形
  vec2 s = rotate(p, uTime * 0.3);
  float star = 1e3;
  for (int k = 0; k < 6; k++) {
    float a0 = float(k) * PI / 3.0;
    float a1 = a0 + 2.0 * PI / 3.0;
    star = min(star, segment(s, 0.56 * vec2(cos(a0), sin(a0)), 0.56 * vec2(cos(a1), sin(a1))));
  }
  a += smoothstep(0.018, 0.0, star) * 0.9;
  // 中心光點與整體淡淡的底光
  a += smoothstep(0.25, 0.0, r) * 0.6;
  a += smoothstep(1.0, 0.0, r) * 0.12;

  // 外緣在展開時更亮
  a *= uFade * (0.85 + 0.15 * sin(uTime * 9.0));
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

const shockFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uT;
uniform float uWidth;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float ang = atan(p.y, p.x);
  // 邊緣擾動：讓光環不是完美的圓
  float wobble = (hash(vec2(floor(ang * 10.0), 1.0)) - 0.5) * 0.04;
  float d = (r + wobble - uT) / uWidth;
  float band = exp(-d * d);
  // 內側留下一層淡淡的餘光
  float inner = smoothstep(uT, 0.0, r) * 0.18 * (1.0 - uT);
  float a = (band + inner) * (1.0 - uT * uT);
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (1.0 + band * 0.8), a);
}
`;

export function createMagicCircleMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(2.4, 2, 0.9) },
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uFade: { value: 0 },
    },
    vertexShader: planeVertex,
    fragmentShader: circleFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });
}

export function createShockwaveMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(2.4, 2, 0.9) },
      uT: { value: 0 },
      uWidth: { value: 0.08 },
    },
    vertexShader: planeVertex,
    fragmentShader: shockFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });
}
