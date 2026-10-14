import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CHANNEL_HALF_WIDTH, CHANNEL_LENGTH, CHANNEL_PATH, CHANNEL_WATER_LEVEL, channelArc, GLOWMOSS_ORIGIN } from '@/game-core/world/glowmossTerrain';
import { terrainHeight } from '@/game-core/world/terrain';
import type { Placement } from '@/game-core/world/types';
import { waterwayFlow, type WaterwayDef } from '@/game-core/world/waterway';
import { authority, waterways, worldIndex } from '@/game/authority';
import { useGameStateStore } from '@/game/state/gameStateStore';
import { waterwayRuntime } from '@/game/world/waterwayRuntime';
import { vfx } from '@/game/vfx/vfxQueue';
import { buildFlowRibbon, createFlowWaterMaterial, type FlowWaterUniforms } from '@/render/flowWater';
import { patchMist } from '@/render/mist';
import { buildProceduralModel, type ModelPart } from '@/render/proceduralModels';
import { toonGradient } from '@/render/toon';

/** 木輪骨架上的高度（模型單位，見 forestModels 的 waterWheelFrame）：輪軸與分水盆 */
const AXLE_Y = 2.9;
const SPOUT_Y = 6.34;
/** 操作桿在骨架局部 +X（東岸）的距離；與 prefab 的 interactOffset 相同 */
const LEVER_X = 5.4;
/** 水往前推進的速度（公尺 / 秒） */
const FLOW_SPEED = 9;
const ROTOR_SPEED = 0.7;
const SPOUT_TURN_RATE = 2.4;
/** 木槽起點離木輪中心的水平距離、終點落在苔蘚節點石槽（節點局部 +Z 0.9 m）上方的高度 */
const FLUME_START = 1.4;
const NODE_BASIN = 0.9;
const FLUME_END_HEIGHT = 0.55;

function placement(id: string): Placement {
  const p = worldIndex.placement(id);
  if (!p) throw new Error(`水道參照不存在的物件：${id}`);
  return p;
}

/** 物件局部 (x, z) 轉世界座標（與 worldIndex 相同：x' = x cos + z sin，z' = −x sin + z cos） */
function local(p: Placement, x: number, z: number): [number, number] {
  const yaw = p.rotation?.[1] ?? 0;
  return [p.position[0] + x * Math.cos(yaw) + z * Math.sin(yaw), p.position[2] - x * Math.sin(yaw) + z * Math.cos(yaw)];
}

function useParts(model: string): ModelPart[] {
  const parts = useMemo(() => buildProceduralModel(`procedural:${model}`), [model]);
  useEffect(
    () => () =>
      parts.forEach((p) => {
        p.geometry.dispose();
        p.material.dispose();
      }),
    [parts],
  );
  return parts;
}

function Parts({ parts }: { parts: ModelPart[] }) {
  return parts.map((p) => <mesh key={p.key} geometry={p.geometry} material={p.material} castShadow={p.name !== 'glow'} receiveShadow />);
}

type Flume = { start: THREE.Vector3; end: THREE.Vector3; yaw: number };

/** 木槽：U 形木板沿直線從分水盆斜斜流到苔蘚節點，每 2.4 m 一根木柱撐到地面 */
function buildFlumes(flumes: readonly Flume[]): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const wood = new THREE.Color('#8a5a33');
  const post = new THREE.Color('#6e4a2f');
  const add = (g: THREE.BufferGeometry, color: THREE.Color) => {
    const n = g.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) color.toArray(colors, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.deleteAttribute('uv');
    parts.push(g.index ? g.toNonIndexed() : g);
  };
  for (const f of flumes) {
    const dir = new THREE.Vector3().subVectors(f.end, f.start);
    const len = dir.length();
    const mid = new THREE.Vector3().addVectors(f.start, f.end).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
    const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1));
    for (const [w, h, x, y] of [
      [0.62, 0.06, 0, 0],
      [0.06, 0.26, -0.3, 0.13],
      [0.06, 0.26, 0.3, 0.13],
    ] as const) {
      const g = new THREE.BoxGeometry(w, h, len);
      g.translate(x, y, 0);
      g.applyMatrix4(m);
      add(g, wood);
    }
    const posts = Math.max(1, Math.floor(len / 2.4));
    for (let k = 1; k <= posts; k++) {
      const t = k / (posts + 1);
      const x = f.start.x + (f.end.x - f.start.x) * t;
      const z = f.start.z + (f.end.z - f.start.z) * t;
      const top = f.start.y + (f.end.y - f.start.y) * t;
      const ground = terrainHeight(x, z) - 0.2;
      if (top - ground < 0.2) continue;
      const g = new THREE.CylinderGeometry(0.07, 0.09, top - ground, 6);
      g.translate(x, (top + ground) / 2, z);
      add(g, post);
    }
  }
  const merged = mergeAll(parts);
  merged.computeVertexNormals();
  return merged;
}

function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let count = 0;
  for (const p of parts) count += p.getAttribute('position').count;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.getAttribute('position').array as Float32Array, o * 3);
    col.set(p.getAttribute('color').array as Float32Array, o * 3);
    o += p.getAttribute('position').count;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** 渠道水面的折線（世界座標）：每 3 m 一點，只取地圖可玩範圍內 */
function channelPoints(): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let i = 0; i + 1 < CHANNEL_PATH.length; i++) {
    const a = CHANNEL_PATH[i]!;
    const b = CHANNEL_PATH[i + 1]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      pts.push([GLOWMOSS_ORIGIN.x + a[0] + (b[0] - a[0]) * t, CHANNEL_WATER_LEVEL, GLOWMOSS_ORIGIN.z + a[1] + (b[1] - a[1]) * t]);
    }
  }
  const last = CHANNEL_PATH[CHANNEL_PATH.length - 1]!;
  pts.push([GLOWMOSS_ORIGIN.x + last[0], CHANNEL_WATER_LEVEL, GLOWMOSS_ORIGIN.z + last[1]]);
  return pts;
}

/** 水停在阻擋點時的沿線距離（阻擋點上游 1.5 m，看起來被擋住） */
function blockerArcs(def: WaterwayDef): number[] {
  return def.blockers.map((id) => {
    const p = placement(id);
    return Math.max(4, channelArc(p.position[0] - GLOWMOSS_ORIGIN.x, p.position[2] - GLOWMOSS_ORIGIN.z) - 1.5);
  });
}

/**
 * 螢苔祕林的古水渠（任務 8C，Bible §6.3：修復前乾裂泥面；修復後流動的水光）。
 * 權威狀態決定水流到哪裡（waterwayFlow）：渠道水面從泉眼推進到第一個還沒排除的阻擋點，全部排除後流到底；
 * 分水木輪的汲水輪在有水時轉動，頂上的分水盆轉向目前的木槽，那道木槽有水流向苔蘚節點。
 */
export function Waterway() {
  const def = waterways[0];
  if (!def) return null;
  return <WaterwayScene def={def} />;
}

function WaterwayScene({ def }: { def: WaterwayDef }) {
  const wheel = placement(def.wheel);
  const yaw = wheel.rotation?.[1] ?? 0;
  const base = wheel.position;
  const flumes = useMemo<Flume[]>(() => {
    const [sx, sy, sz] = placement(def.wheel).position;
    return def.outlets.map((id) => {
      const [ex, ez] = local(placement(id), 0, NODE_BASIN);
      const dir = Math.atan2(ex - sx, ez - sz);
      const start = new THREE.Vector3(sx + Math.sin(dir) * FLUME_START, sy + SPOUT_Y + 0.18, sz + Math.cos(dir) * FLUME_START);
      const end = new THREE.Vector3(ex, terrainHeight(ex, ez) + FLUME_END_HEIGHT, ez);
      return { start, end, yaw: dir };
    });
  }, [def]);
  const flumeGeometry = useMemo(() => buildFlumes(flumes), [flumes]);
  const flumeMaterial = useMemo(() => patchMist(new THREE.MeshToonMaterial({ gradientMap: toonGradient(), vertexColors: true })), []);
  const channel = useMemo(() => {
    const geometry = buildFlowRibbon(channelPoints(), CHANNEL_HALF_WIDTH + 1.4);
    const { material, uniforms } = createFlowWaterMaterial();
    return { geometry, material, uniforms };
  }, []);
  const flumeWater = useMemo(
    () =>
      flumes.map((f) => {
        const geometry = buildFlowRibbon(
          [
            [f.start.x, f.start.y + 0.17, f.start.z],
            [f.end.x, f.end.y + 0.17, f.end.z],
          ],
          0.27,
        );
        const { material, uniforms } = createFlowWaterMaterial();
        return { geometry, material, uniforms };
      }),
    [flumes],
  );
  const arcs = useMemo(() => blockerArcs(def), [def]);
  useEffect(
    () => () => {
      flumeGeometry.dispose();
      flumeMaterial.dispose();
      channel.geometry.dispose();
      channel.material.dispose();
      for (const w of flumeWater) {
        w.geometry.dispose();
        w.material.dispose();
      }
    },
    [flumeGeometry, flumeMaterial, channel, flumeWater],
  );

  const rotorParts = useParts('water_wheel_rotor');
  const spoutParts = useParts('water_wheel_spout');
  const leverParts = useParts('water_wheel_lever');
  const rotor = useRef<THREE.Group>(null);
  const spout = useRef<THREE.Group>(null);
  const [lx, lz] = local(wheel, LEVER_X, 0);
  const leverY = terrainHeight(lx, lz) - 0.05;

  // 苔蘚節點被水喚醒：光點上升與一圈光環
  useEffect(
    () =>
      authority.subscribe((events) => {
        for (const e of events) {
          if (e.type !== 'ObjectActivated' || e.source !== 'water') continue;
          const p = worldIndex.placement(e.placementId);
          if (!p) continue;
          const [x, y, z] = p.position;
          vfx({ type: 'burst', preset: 'purify', x, y: y + 0.3, z, color: [0.55, 0.9, 0.75] });
          vfx({ type: 'shockwave', x, y: y + 0.1, z, radius: 3, duration: 0.9, color: [0.55, 0.9, 0.75] });
        }
      }),
    [],
  );

  const view = useMemo(() => ({ channelReach: -1, flumeReach: flumes.map(() => 0), spoutYaw: Number.NaN }), [flumes]);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const flow = waterwayFlow(def, useGameStateStore.getState().state.objects);
    const target = flow.flowing ? CHANNEL_LENGTH : arcs[flow.cleared]!;
    // 第一次（載入存檔）直接到位；之後水往前推進、往後退得快一點
    if (view.channelReach < 0) view.channelReach = target;
    else if (view.channelReach < target) view.channelReach = Math.min(target, view.channelReach + FLOW_SPEED * dt);
    else view.channelReach = Math.max(target, view.channelReach - FLOW_SPEED * 3 * dt);
    channel.uniforms.uTime.value += dt;
    channel.uniforms.uReach.value = view.channelReach;

    flumes.forEach((f, i) => {
      const on = flow.flowing && flow.turn === i;
      const len = f.start.distanceTo(f.end);
      const reach = view.flumeReach;
      reach[i] = on ? Math.min(len + 1, reach[i]! + FLOW_SPEED * 0.6 * dt) : Math.max(0, reach[i]! - FLOW_SPEED * dt);
      const u: FlowWaterUniforms = flumeWater[i]!.uniforms;
      u.uTime.value += dt;
      u.uReach.value = reach[i]!;
    });

    if (flow.flowing) waterwayRuntime.rotorAngle += ROTOR_SPEED * dt;
    if (rotor.current) rotor.current.rotation.x = -waterwayRuntime.rotorAngle;
    waterwayRuntime.channelReach = view.channelReach;
    waterwayRuntime.flumeReach = view.flumeReach;
    if (spout.current) {
      // 分水盆的 +Z（出水口）轉向目前的木槽；角度以世界座標計算，再扣掉骨架的 yaw
      const want = flumes[flow.turn]!.yaw - yaw;
      if (Number.isNaN(view.spoutYaw)) view.spoutYaw = want;
      const diff = Math.atan2(Math.sin(want - view.spoutYaw), Math.cos(want - view.spoutYaw));
      view.spoutYaw += Math.sign(diff) * Math.min(Math.abs(diff), SPOUT_TURN_RATE * dt);
      spout.current.rotation.y = view.spoutYaw;
      waterwayRuntime.spoutYaw = view.spoutYaw;
    }
  });

  return (
    <group name="waterway">
      <mesh geometry={channel.geometry} material={channel.material} renderOrder={1} name="channel-water" />
      <mesh geometry={flumeGeometry} material={flumeMaterial} castShadow receiveShadow name="flumes" />
      {flumeWater.map((w, i) => (
        <mesh key={i} geometry={w.geometry} material={w.material} renderOrder={1} name={`flume-water-${i}`} />
      ))}
      <group position={base} rotation={[0, yaw, 0]}>
        <group ref={rotor} position={[0, AXLE_Y, 0]}>
          <Parts parts={rotorParts} />
        </group>
        <group ref={spout} position={[0, SPOUT_Y, 0]}>
          <Parts parts={spoutParts} />
        </group>
      </group>
      <group position={[lx, leverY, lz]} rotation={[0, yaw - Math.PI / 2, 0]}>
        <Parts parts={leverParts} />
      </group>
    </group>
  );
}
