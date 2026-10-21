import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useQualityPreset } from '@/game/state/settingsStore';
import { playerRuntime } from '@/game/player/localRuntime';
import { projectileVisuals, vfxQueue, vfxStats, type BurstPreset, type Rgb, type VfxRequest } from '@/game/vfx/vfxQueue';
import { GpuParticles, type ParticleShape } from '@/render/vfx/gpuParticles';
import { createMagicCircleMaterial, createShockwaveMaterial } from '@/render/vfx/magicShaders';

/**
 * 特效系統（GAME_DESIGN 5.4 VFX 引擎）：取出 vfxQueue 的請求，用預先配置的資源播放。
 * - 粒子：GpuParticles（一個 draw call，容量 = 畫質的粒子預算）
 * - 魔法陣 3 個、衝擊波 4 個（物件池，不足時覆蓋最舊的）
 * - 點光源最多 2 盞（GAME_DESIGN 6.2 效能預算）
 * - 飛行中的彈體：每幀在位置上補一顆核心光點與拖尾粒子
 * useFrame 內不 setState、不配置新的 three 物件。
 */

const CIRCLES = 3;
const SHOCKWAVES = 4;
/** 點光源：中高畫質 2 盞；低畫質不用（每盞都會增加所有受光材質的計算量） */
const LIGHTS = 2;
/** 載入後前幾幀讓所有池內物件以「看不見」的參數畫一次，shader 在載入時就編譯好，第一次施法不會卡頓 */
const WARMUP_FRAMES = 3;
/** 彈體拖尾：每公尺發射的粒子數 */
const TRAIL_PER_METER = 9;

type Slot = { active: boolean; age: number; duration: number; radius: number; follow: boolean; x: number; y: number; z: number };
const emptySlot = (): Slot => ({ active: false, age: 0, duration: 1, radius: 1, follow: false, x: 0, y: 0, z: 0 });

/** 簡單的亂數（特效不需要可重現） */
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function VfxSystem() {
  const preset = useQualityPreset();
  const particles = useMemo(() => new GpuParticles(preset.particleBudget), [preset.particleBudget]);
  const lightCount = preset.postprocessing ? LIGHTS : 0;
  useEffect(() => () => particles.dispose(), [particles]);

  const circleGeo = useMemo(() => new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), []);
  const circleMats = useMemo(() => Array.from({ length: CIRCLES }, createMagicCircleMaterial), []);
  const shockMats = useMemo(() => Array.from({ length: SHOCKWAVES }, createShockwaveMaterial), []);
  useEffect(
    () => () => {
      circleGeo.dispose();
      circleMats.forEach((m) => m.dispose());
      shockMats.forEach((m) => m.dispose());
    },
    [circleGeo, circleMats, shockMats],
  );
  const circleRefs = useRef<(THREE.Mesh | null)[]>([]);
  const shockRefs = useRef<(THREE.Mesh | null)[]>([]);
  const lightRefs = useRef<(THREE.PointLight | null)[]>([]);
  const state = useMemo(
    () => ({
      circles: Array.from({ length: CIRCLES }, emptySlot),
      shocks: Array.from({ length: SHOCKWAVES }, emptySlot),
      lights: Array.from({ length: LIGHTS }, () => ({ ...emptySlot(), intensity: 0, color: [1, 1, 1] as Rgb })),
      nextCircle: 0,
      nextShock: 0,
      nextLight: 0,
      time: 0,
      statsAge: 0,
      warmup: WARMUP_FRAMES,
      /** 彈體上一幀的位置（補拖尾用） */
      last: new Map<number, { x: number; y: number; z: number }>(),
    }),
    [],
  );

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    state.time += dt;
    while (vfxQueue.length > 0) handle(vfxQueue.shift()!);
    if (state.warmup > 0) {
      state.warmup--;
      circleRefs.current.forEach((m) => m && (m.visible = true));
      circleMats.forEach((m) => (m.uniforms.uFade!.value = 0));
      shockRefs.current.forEach((m) => m && (m.visible = true));
      shockMats.forEach((m) => (m.uniforms.uT!.value = 1));
      particles.update(dt);
      return;
    }

    // 魔法陣：0.25 秒展開、最後 30% 淡出；跟隨玩家時每幀更新位置
    state.circles.forEach((c, i) => {
      const mesh = circleRefs.current[i];
      const mat = circleMats[i]!;
      if (!mesh) return;
      if (!c.active) {
        mesh.visible = false;
        return;
      }
      c.age += dt;
      if (c.age >= c.duration) {
        c.active = false;
        mesh.visible = false;
        return;
      }
      if (c.follow) {
        c.x = playerRuntime.position.x;
        c.z = playerRuntime.position.z;
        c.y = playerRuntime.position.y - 0.76;
      }
      mesh.visible = true;
      mesh.position.set(c.x, c.y + 0.05, c.z);
      mesh.scale.setScalar(c.radius);
      const t = c.age / c.duration;
      mat.uniforms.uTime!.value = state.time;
      mat.uniforms.uProgress!.value = Math.min(1, c.age / 0.25);
      mat.uniforms.uFade!.value = 1 - THREE.MathUtils.smoothstep(t, 0.7, 1);
    });

    state.shocks.forEach((s, i) => {
      const mesh = shockRefs.current[i];
      if (!mesh) return;
      if (!s.active) {
        mesh.visible = false;
        return;
      }
      s.age += dt;
      if (s.age >= s.duration) {
        s.active = false;
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      mesh.position.set(s.x, s.y + 0.08, s.z);
      mesh.scale.setScalar(s.radius);
      // 快速擴散、逐漸放慢
      shockMats[i]!.uniforms.uT!.value = 1 - (1 - s.age / s.duration) ** 2.4;
    });

    state.lights.forEach((l, i) => {
      const light = lightRefs.current[i];
      if (!light) return;
      // 點光源一直存在、閒置時強度為 0：切換 visible 會改變場景燈光數量，導致所有材質重新編譯（卡頓）
      if (!l.active) {
        light.intensity = 0;
        return;
      }
      l.age += dt;
      if (l.age >= l.duration) {
        l.active = false;
        light.intensity = 0;
        return;
      }
      light.position.set(l.x, l.y, l.z);
      light.color.setRGB(l.color[0], l.color[1], l.color[2]);
      light.intensity = l.intensity * (1 - l.age / l.duration) ** 2;
      light.distance = l.radius;
    });

    // 彈體：核心光點 + 沿飛行路徑補拖尾
    for (const p of projectileVisuals.values()) {
      const [r, g, b] = p.color;
      particles.emit({ x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0, r, g, b, life: 0.07, size: p.size * 1.6, sizeEnd: 1, shape: 'star' });
      const last = state.last.get(p.id);
      if (last) {
        const dist = Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z);
        const n = Math.min(12, Math.ceil(dist * TRAIL_PER_METER * p.trail));
        for (let k = 0; k < n; k++) {
          const f = k / n;
          particles.emit({
            x: last.x + (p.x - last.x) * f + rand(-0.05, 0.05),
            y: last.y + (p.y - last.y) * f + rand(-0.05, 0.05),
            z: last.z + (p.z - last.z) * f + rand(-0.05, 0.05),
            vx: rand(-0.4, 0.4),
            vy: rand(-0.2, 0.6),
            vz: rand(-0.4, 0.4),
            r,
            g,
            b,
            life: rand(0.25, 0.45),
            size: p.size * rand(0.5, 0.9),
            sizeEnd: 0.1,
            shape: k % 3 === 0 ? 'star' : 'soft',
            drag: 2,
          });
        }
      }
      state.last.set(p.id, { x: p.x, y: p.y, z: p.z });
    }
    for (const id of state.last.keys()) if (!projectileVisuals.has(id)) state.last.delete(id);

    particles.update(dt);
    vfxStats.capacity = particles.capacity;
    vfxStats.emitted = particles.emitted;
    vfxStats.circles = state.circles.filter((c) => c.active).length;
    vfxStats.shockwaves = state.shocks.filter((s) => s.active).length;
    vfxStats.lights = state.lights.filter((l) => l.active).length;
    // 活著的粒子數要逐一檢查，每 0.5 秒更新一次就夠（除錯與測試用）
    state.statsAge += dt;
    if (state.statsAge > 0.5) {
      state.statsAge = 0;
      vfxStats.alive = particles.aliveCount();
    }
  });

  function handle(req: VfxRequest): void {
    switch (req.type) {
      case 'magicCircle': {
        const slot = state.circles[state.nextCircle]!;
        state.nextCircle = (state.nextCircle + 1) % CIRCLES;
        Object.assign(slot, { active: true, age: 0, duration: req.duration, radius: req.radius, follow: req.follow ?? false, x: req.x, y: req.y, z: req.z });
        circleMats[state.circles.indexOf(slot)]!.uniforms.uColor!.value.setRGB(...req.color);
        // 魔法陣出現時有光點往中心聚集
        burst('gather', req.x, req.y + 0.1, req.z, req.color, req.radius / 1.6);
        break;
      }
      case 'shockwave': {
        const slot = state.shocks[state.nextShock]!;
        state.nextShock = (state.nextShock + 1) % SHOCKWAVES;
        Object.assign(slot, { active: true, age: 0, duration: req.duration, radius: req.radius, x: req.x, y: req.y, z: req.z });
        shockMats[state.shocks.indexOf(slot)]!.uniforms.uColor!.value.setRGB(...req.color);
        break;
      }
      case 'flash': {
        if (lightCount === 0) break;
        const slot = state.lights[state.nextLight]!;
        state.nextLight = (state.nextLight + 1) % LIGHTS;
        Object.assign(slot, { active: true, age: 0, duration: req.duration, radius: req.distance ?? 10, x: req.x, y: req.y, z: req.z, intensity: req.intensity, color: req.color });
        break;
      }
      case 'burst':
        burst(req.preset, req.x, req.y, req.z, req.color, req.scale ?? 1);
        break;
    }
  }

  function burst(preset: BurstPreset, x: number, y: number, z: number, color: Rgb, scale: number): void {
    const [r, g, b] = color;
    const emit = (
      count: number,
      fn: (i: number) => { dx: number; dy: number; dz: number; vx: number; vy: number; vz: number; life: number; size: number; shape: ParticleShape; gravity?: number; drag?: number; tint?: number },
    ) => {
      // 低畫質時粒子數量依預算縮小
      const n = Math.max(1, Math.round(count * Math.min(1, particles.capacity / 2000)));
      for (let i = 0; i < n; i++) {
        const p = fn(i);
        const tint = p.tint ?? 1;
        particles.emit({
          x: x + p.dx,
          y: y + p.dy,
          z: z + p.dz,
          vx: p.vx,
          vy: p.vy,
          vz: p.vz,
          r: r * tint,
          g: g * tint,
          b: b * tint,
          life: p.life,
          size: p.size,
          shape: p.shape,
          gravity: p.gravity,
          drag: p.drag,
        });
      }
    };
    switch (preset) {
      case 'nova':
        // 星點螺旋上升
        emit(110, (i) => {
          const a = (i / 110) * Math.PI * 12 + rand(0, 0.4);
          const rad = rand(0.3, 1.3) * scale;
          return {
            dx: Math.cos(a) * rad,
            dy: rand(0, 0.4),
            dz: Math.sin(a) * rad,
            vx: -Math.sin(a) * 3 + Math.cos(a) * 2.5,
            vy: rand(2.5, 6),
            vz: Math.cos(a) * 3 + Math.sin(a) * 2.5,
            life: rand(0.8, 1.4),
            size: rand(0.18, 0.34),
            shape: 'star',
            gravity: -1.2,
            drag: 1.4,
          };
        });
        // 貼地往外飛的火花
        emit(60, (i) => {
          const a = (i / 60) * Math.PI * 2;
          const v = rand(8, 13) * scale;
          return { dx: 0, dy: 0.15, dz: 0, vx: Math.cos(a) * v, vy: rand(0.5, 1.5), vz: Math.sin(a) * v, life: rand(0.3, 0.5), size: rand(0.3, 0.5), shape: 'spark', drag: 3.5, gravity: 4 };
        });
        // 中心的柔光
        emit(24, () => ({ dx: rand(-0.4, 0.4), dy: rand(0.2, 1.4), dz: rand(-0.4, 0.4), vx: rand(-1, 1), vy: rand(0.5, 1.5), vz: rand(-1, 1), life: rand(0.4, 0.7), size: rand(0.8, 1.4) * scale, shape: 'soft', drag: 2, tint: 0.5 }));
        break;
      case 'gather':
        emit(36, () => {
          const a = rand(0, Math.PI * 2);
          const rad = rand(1.8, 2.6) * scale;
          const life = rand(0.3, 0.45);
          return { dx: Math.cos(a) * rad, dy: rand(0, 0.8), dz: Math.sin(a) * rad, vx: (-Math.cos(a) * rad) / life, vy: 0.4, vz: (-Math.sin(a) * rad) / life, life, size: rand(0.1, 0.2), shape: 'soft' };
        });
        break;
      case 'boltHit':
        emit(26, () => {
          const a = rand(0, Math.PI * 2);
          const up = rand(-0.3, 1);
          const v = rand(3, 7);
          return { dx: 0, dy: 0, dz: 0, vx: Math.cos(a) * v, vy: up * v, vz: Math.sin(a) * v, life: rand(0.3, 0.5), size: rand(0.15, 0.3), shape: 'star', drag: 4 };
        });
        emit(8, () => ({ dx: 0, dy: 0, dz: 0, vx: rand(-0.5, 0.5), vy: rand(0, 1), vz: rand(-0.5, 0.5), life: 0.25, size: rand(0.8, 1.2), shape: 'soft', tint: 0.6 }));
        break;
      case 'purify':
        // 霧散成金色光點，緩緩往上飄
        emit(56, () => {
          const a = rand(0, Math.PI * 2);
          const rad = rand(0, 0.7);
          return { dx: Math.cos(a) * rad, dy: rand(0.2, 1.4), dz: Math.sin(a) * rad, vx: Math.cos(a) * rand(0.2, 1), vy: rand(1.2, 2.8), vz: Math.sin(a) * rad * 1.5, life: rand(1.1, 1.8), size: rand(0.12, 0.26), shape: Math.random() < 0.4 ? 'star' : 'soft', gravity: -0.6, drag: 0.8 };
        });
        break;
      case 'meteorHit':
        emit(70, () => {
          const a = rand(0, Math.PI * 2);
          const v = rand(5, 11) * scale;
          return { dx: 0, dy: 0.2, dz: 0, vx: Math.cos(a) * v, vy: rand(2, 7), vz: Math.sin(a) * v, life: rand(0.5, 0.9), size: rand(0.2, 0.4), shape: Math.random() < 0.5 ? 'spark' : 'star', gravity: 9, drag: 1.5 };
        });
        emit(20, () => ({ dx: rand(-0.6, 0.6), dy: rand(0, 1), dz: rand(-0.6, 0.6), vx: rand(-1.5, 1.5), vy: rand(1, 3), vz: rand(-1.5, 1.5), life: rand(0.5, 0.9), size: rand(1, 1.8) * scale, shape: 'soft', drag: 2, tint: 0.45 }));
        break;
    }
  }

  return (
    <>
      <primitive object={particles.mesh} />
      {circleMats.map((mat, i) => (
        <mesh key={`c${i}`} ref={(m) => void (circleRefs.current[i] = m)} geometry={circleGeo} material={mat} visible={false} renderOrder={10} />
      ))}
      {shockMats.map((mat, i) => (
        <mesh key={`s${i}`} ref={(m) => void (shockRefs.current[i] = m)} geometry={circleGeo} material={mat} visible={false} renderOrder={10} />
      ))}
      {Array.from({ length: lightCount }, (_, i) => (
        <pointLight key={`l${i}`} ref={(l) => void (lightRefs.current[i] = l)} intensity={0} distance={10} decay={1.6} />
      ))}
    </>
  );
}
