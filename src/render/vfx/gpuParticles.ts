import * as THREE from 'three';

/**
 * GPU 粒子池（GAME_DESIGN 5.4 VFX 引擎）：所有魔法粒子共用一個 instanced 四邊形、一個 draw call。
 * 每顆粒子在發射時寫入一次「起點、速度、顏色、出生時間、壽命、大小、重力、阻力、形狀」，
 * 之後的運動、縮放、淡出與面向攝影機全部在 vertex shader 內以時間計算，CPU 不必每幀更新。
 * 槽位是環狀緩衝：容量用完時覆蓋最舊的粒子（容量即畫質的粒子預算）。
 */

export type ParticleShape = 'soft' | 'star' | 'spark';
const SHAPE_ID: Record<ParticleShape, number> = { soft: 0, star: 1, spark: 2 };

export type ParticleSpec = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** HDR 顏色（> 1 觸發 Bloom） */
  r: number;
  g: number;
  b: number;
  /** 壽命（秒） */
  life: number;
  /** 起始大小（公尺）與結束時的倍率 */
  size: number;
  sizeEnd?: number;
  /** 重力（公尺 / 秒²，正值往下） */
  gravity?: number;
  /** 速度阻力（每秒衰減比例，0 表示不衰減） */
  drag?: number;
  shape?: ParticleShape;
};

const vertexShader = /* glsl */ `
uniform float uTime;
attribute vec3 aStart;
attribute vec3 aVel;
attribute vec3 aColor;
/** x 出生時間、y 壽命、z 大小、w 結束大小倍率 */
attribute vec4 aLife;
/** x 重力、y 阻力、z 形狀、w 旋轉種子 */
attribute vec4 aMotion;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
varying float vShape;
void main() {
  float age = uTime - aLife.x;
  float t = age / max(aLife.y, 1e-3);
  vUv = uv;
  vColor = aColor;
  vShape = aMotion.z;
  if (age < 0.0 || t >= 1.0) {
    // 已死亡或尚未出生：丟到裁切範圍外
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vAlpha = 0.0;
    return;
  }
  // 有阻力時的位移：v * (1 - e^(-k t)) / k；沒有阻力時退化成 v * t
  float k = aMotion.y;
  float travel = k > 0.0 ? (1.0 - exp(-k * age)) / k : age;
  vec3 center = aStart + aVel * travel - vec3(0.0, 0.5 * aMotion.x * age * age, 0.0);
  float size = aLife.z * mix(1.0, aLife.w, t);
  // 出生時快速放大、結束前淡出
  vAlpha = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.55, 1.0, t));
  // 面向攝影機的四邊形，緩慢旋轉（星形粒子）
  float spin = aMotion.w + age * 2.0;
  vec2 corner = (uv - 0.5) * size;
  float c = cos(spin);
  float s = sin(spin);
  corner = vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y);
  vec4 view = viewMatrix * vec4(center, 1.0);
  view.xy += corner;
  gl_Position = projectionMatrix * view;
}
`;

const fragmentShader = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
varying float vShape;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float d = length(p);
  float a;
  if (vShape < 0.5) {
    // 柔和圓點
    a = smoothstep(1.0, 0.0, d);
    a *= a;
  } else if (vShape < 1.5) {
    // 四芒星：中心亮點 + 十字光芒
    float core = smoothstep(0.45, 0.0, d);
    float rays = max(smoothstep(0.16, 0.0, abs(p.x)) * smoothstep(1.0, 0.1, abs(p.y)), smoothstep(0.16, 0.0, abs(p.y)) * smoothstep(1.0, 0.1, abs(p.x)));
    a = max(core, rays * 0.9);
  } else {
    // 火花：細長亮點
    a = smoothstep(0.25, 0.0, abs(p.y)) * smoothstep(1.0, 0.2, abs(p.x));
  }
  a *= vAlpha;
  if (a < 0.003) discard;
  // 中心偏白：高亮處接近白色，更有發光感
  vec3 col = mix(vColor, vec3(max(vColor.r, max(vColor.g, vColor.b))), smoothstep(0.6, 1.0, a) * 0.5);
  // 加法混合（src × srcAlpha + dst）：顏色不必再乘一次透明度
  gl_FragColor = vec4(col, a);
}
`;

export class GpuParticles {
  readonly mesh: THREE.Mesh;
  readonly capacity: number;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly start: THREE.InstancedBufferAttribute;
  private readonly vel: THREE.InstancedBufferAttribute;
  private readonly color: THREE.InstancedBufferAttribute;
  private readonly life: THREE.InstancedBufferAttribute;
  private readonly motion: THREE.InstancedBufferAttribute;
  private cursor = 0;
  /** 本幀寫入的槽位範圍（只上傳這段） */
  private dirtyFrom = Infinity;
  private dirtyTo = -1;
  private time = 0;
  /** 累計發射數量（測試與除錯用） */
  emitted = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    const quad = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = quad.index;
    geometry.setAttribute('position', quad.getAttribute('position'));
    geometry.setAttribute('uv', quad.getAttribute('uv'));
    const attr = (size: number) => new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size).setUsage(THREE.DynamicDrawUsage);
    this.start = attr(3);
    this.vel = attr(3);
    this.color = attr(3);
    this.life = attr(4);
    this.motion = attr(4);
    // 全部槽位一開始都是「已死亡」（出生時間很久以前）
    for (let i = 0; i < capacity; i++) this.life.setXYZW(i, -1000, 0.001, 0, 1);
    geometry.setAttribute('aStart', this.start);
    geometry.setAttribute('aVel', this.vel);
    geometry.setAttribute('aColor', this.color);
    geometry.setAttribute('aLife', this.life);
    geometry.setAttribute('aMotion', this.motion);
    geometry.instanceCount = capacity;
    this.geometry = geometry;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader,
      fragmentShader,
      transparent: true,
      // 粒子特效（含法術）不被前景草叢遮住，見 magicShaders
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.name = 'vfx-particles';
  }

  emit(p: ParticleSpec): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.start.setXYZ(i, p.x, p.y, p.z);
    this.vel.setXYZ(i, p.vx, p.vy, p.vz);
    this.color.setXYZ(i, p.r, p.g, p.b);
    this.life.setXYZW(i, this.time, p.life, p.size, p.sizeEnd ?? 0.2);
    this.motion.setXYZW(i, p.gravity ?? 0, p.drag ?? 0, SHAPE_ID[p.shape ?? 'soft'], (i * 2.399963) % 6.283);
    this.dirtyFrom = Math.min(this.dirtyFrom, i);
    this.dirtyTo = Math.max(this.dirtyTo, i);
    this.emitted++;
  }

  /** 每幀呼叫：推進時間，並把本幀寫入的槽位上傳到 GPU */
  update(dt: number): void {
    this.time += dt;
    this.material.uniforms.uTime!.value = this.time;
    if (this.dirtyTo < 0) return;
    // 環狀緩衝繞回時，dirtyFrom 可能在 dirtyTo 前面很遠，直接上傳整段最簡單
    const from = this.dirtyFrom;
    const count = this.dirtyTo - from + 1;
    for (const a of [this.start, this.vel, this.color, this.life, this.motion]) {
      a.clearUpdateRanges();
      a.addUpdateRange(from * a.itemSize, count * a.itemSize);
      a.needsUpdate = true;
    }
    this.dirtyFrom = Infinity;
    this.dirtyTo = -1;
  }

  /** 目前活著的粒子數（除錯用；逐一檢查，不要每幀呼叫） */
  aliveCount(): number {
    let n = 0;
    for (let i = 0; i < this.capacity; i++) {
      const birth = this.life.getX(i);
      if (this.time - birth < this.life.getY(i)) n++;
    }
    return n;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
