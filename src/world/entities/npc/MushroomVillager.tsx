import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { currentScreen } from '@/game/state/gameStore';
import { patchMist } from '@/render/mist';
import { toonGradient } from '@/render/toon';

/**
 * 蘑菇居民（2026-10-25 使用者指示：聚落的居民是蘑菇）：菌柄當身體、菌傘當頭頂，臉在菌柄上半部。
 * 依角色換菌傘顏色、斑點與小道具。沒有骨架：待機時呼吸、菌傘輕晃，說話時揮手；小孩會原地輕跳。
 * 原點在腳底，面向 +Z；身高約 0.7–1.2 m（依角色）。
 */
export type MushroomKind = 'granny' | 'kid' | 'farmer' | 'lookout';

type Look = {
  size: number;
  cap: string;
  spot: string;
  /** 斑點發光（菇菇婆婆的紫色菌傘有螢光斑點） */
  glowSpots?: boolean;
  /** 菌柄（身體）顏色 */
  stem: string;
  cloth: string;
  accent: string;
  /** 菌傘寬度（相對身體）與高度 */
  capWidth: number;
  capHeight: number;
  props: ('shawl' | 'cane' | 'apron' | 'basket' | 'scarf' | 'lantern' | 'leaf')[];
  /** 小孩原地輕跳 */
  hop?: boolean;
  /** 駝背（往前傾的角度） */
  stoop?: number;
};

const LOOKS: Record<MushroomKind, Look> = {
  // 菇菇婆婆：聚落的藥草師，紫色菌傘帶螢光斑點、花草披肩、木拐杖，有點駝背
  granny: { size: 1, cap: '#7a5a9a', spot: '#8de6be', glowSpots: true, stem: '#efe2c8', cloth: '#6f5a7a', accent: '#b9a2e6', capWidth: 1.25, capHeight: 0.62, props: ['shawl', 'cane'], stoop: 0.18 },
  // 菇丁：聚落的小孩，紅傘白點，頭上頂著一片葉子，會在廣場上蹦蹦跳
  kid: { size: 0.72, cap: '#d0483a', spot: '#fff4e0', stem: '#f6ead2', cloth: '#5a8ac0', accent: '#7fc860', capWidth: 1.3, capHeight: 0.75, props: ['leaf'], hop: true },
  // 菇伯：種菇的農夫，寬大的棕色菌傘、沾泥圍裙、提著一籃螢苔
  farmer: { size: 1.15, cap: '#9a6a44', spot: '#f1dcb4', stem: '#e8d8b8', cloth: '#6b5a3e', accent: '#c9a060', capWidth: 1.45, capHeight: 0.5, props: ['apron', 'basket'] },
  // 菇哨：守在聚落南口（往迷霧深層）的哨兵，灰藍菌傘、圍巾，提著燈籠望著迷霧深層
  lookout: { size: 1.05, cap: '#5a6f8a', spot: '#d8e6f0', stem: '#e6dcc8', cloth: '#3f5a6a', accent: '#d8a040', capWidth: 1.15, capHeight: 0.7, props: ['scarf', 'lantern'] },
};

const materialCache = new Map<string, THREE.Material>();
function toon(color: string): THREE.Material {
  let m = materialCache.get(color);
  if (!m) {
    m = patchMist(new THREE.MeshToonMaterial({ gradientMap: toonGradient(), color }));
    materialCache.set(color, m);
  }
  return m;
}
const glowCache = new Map<string, THREE.Material>();
function glow(color: string, power: number): THREE.Material {
  const key = `${color}:${power}`;
  let m = glowCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), toneMapped: false });
    glowCache.set(key, m);
  }
  return m;
}
const eyeMaterial = new THREE.MeshBasicMaterial({ color: '#1f1a24' });
const shineMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });

let geometry: Record<string, THREE.BufferGeometry> | null = null;
function geo() {
  geometry ??= {
    sphere: new THREE.SphereGeometry(1, 18, 14),
    lowSphere: new THREE.SphereGeometry(1, 10, 8),
    dome: new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    capsule: new THREE.CapsuleGeometry(1, 2, 4, 10),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 16),
    stem: new THREE.CylinderGeometry(0.85, 1, 1, 16),
    cone: new THREE.ConeGeometry(1, 1, 8),
    box: new THREE.BoxGeometry(1, 1, 1),
    torus: new THREE.TorusGeometry(1, 0.25, 8, 20),
    disc: new THREE.CircleGeometry(1, 20),
  };
  return geometry;
}

/** 菌傘上斑點的位置（單位菌傘，固定的排列，不用亂數） */
const SPOTS: readonly [number, number][] = [
  [0.0, 0.0],
  [0.55, 0.4],
  [2.3, 0.55],
  [4.0, 0.5],
  [5.3, 0.62],
  [1.2, 0.72],
  [3.2, 0.75],
];

export function MushroomVillager({ kind, talking }: { kind: MushroomKind; talking: () => boolean }) {
  const look = LOOKS[kind];
  const g = geo();
  const m = useMemo(
    () => ({
      cap: toon(look.cap),
      spot: look.glowSpots ? glow(look.spot, 1.6) : toon(look.spot),
      stem: toon(look.stem),
      gills: toon('#d9c6a4'),
      cloth: toon(look.cloth),
      accent: toon(look.accent),
      wood: toon('#8a5a33'),
      dark: toon('#3a2f2a'),
      blush: toon('#f2a0a0'),
      leaf: toon('#5fae4a'),
      moss: toon('#5f9a6a'),
      lamp: glow('#ffc070', 2.4),
    }),
    [look],
  );
  const body = useRef<THREE.Group>(null);
  const cap = useRef<THREE.Group>(null);
  const arm = useRef<THREE.Group>(null);
  // 每個角色的待機動作錯開一點（不用亂數：渲染時不能呼叫不純的函式）
  const local = useMemo(() => ({ time: kind.length * 1.3, talk: 0 }), [kind]);
  useFrame((_, rawDt) => {
    if (currentScreen() === 'paused') return;
    const dt = Math.min(rawDt, 1 / 20);
    local.time += dt;
    local.talk = talking() ? local.talk + dt : 0;
    const t = local.time;
    const b = body.current;
    if (b) {
      const breathe = 1 + Math.sin(t * 2) * 0.025;
      b.scale.set(1 / Math.sqrt(breathe), breathe, 1 / Math.sqrt(breathe));
      // 小孩：不說話時每隔一下蹦一下
      const hop = look.hop && local.talk === 0 ? Math.max(0, Math.sin(t * 4.2)) ** 2 * 0.12 : 0;
      b.position.y = hop + (local.talk > 0 ? Math.abs(Math.sin(local.talk * 6)) * 0.03 : 0);
    }
    if (cap.current) cap.current.rotation.set(Math.sin(t * 0.8) * 0.05, 0, Math.sin(t * 0.6) * 0.06);
    // 說話時揮手
    if (arm.current) arm.current.rotation.z = local.talk > 0 ? -1.7 - Math.sin(local.talk * 9) * 0.35 : -0.2;
  });

  const has = (p: Look['props'][number]) => look.props.includes(p);
  // 菌柄（身體）：高 0.62、半徑 0.24；臉在上半部；菌傘蓋在柄頂
  const stemH = 0.62;
  const stemR = 0.24;
  const capR = stemR * look.capWidth * 1.45;
  return (
    <group scale={look.size}>
      {/* 腳 */}
      {[-1, 1].map((side) => (
        <mesh key={side} geometry={g.lowSphere} material={m.dark} position={[side * 0.1, 0.05, 0.04]} scale={[0.085, 0.06, 0.12]} />
      ))}
      <group ref={body}>
        <group rotation-x={look.stoop ?? 0}>
          {/* 菌柄身體：下半部是衣服 */}
          <mesh geometry={g.stem} material={m.stem} position={[0, 0.06 + stemH / 2, 0]} scale={[stemR, stemH, stemR]} castShadow />
          <mesh geometry={g.stem} material={m.cloth} position={[0, 0.06 + 0.14, 0]} scale={[stemR * 1.08, 0.28, stemR * 1.08]} />
          {/* 臉：眼睛、腮紅、小嘴 */}
          {[-1, 1].map((side) => (
            <group key={side} position={[side * 0.08, 0.06 + stemH * 0.72, stemR * 0.93]}>
              <mesh geometry={g.lowSphere} material={eyeMaterial} scale={[0.028, 0.036, 0.015]} />
              <mesh geometry={g.lowSphere} material={shineMaterial} position={[0.009, 0.013, 0.01]} scale={0.009} />
              <mesh geometry={g.lowSphere} material={m.blush} position={[side * 0.045, -0.05, -0.005]} scale={[0.03, 0.018, 0.01]} />
            </group>
          ))}
          <mesh geometry={g.torus} material={m.dark} position={[0, 0.06 + stemH * 0.6, stemR * 0.95]} rotation={[0, 0, Math.PI]} scale={[0.025, 0.02, 0.02]} />
          {/* 手：左手垂下（或拄拐杖），右手說話時揮 */}
          <mesh geometry={g.capsule} material={m.stem} position={[-0.27, 0.36, 0.02]} rotation={[0, 0, 0.3]} scale={[0.05, 0.065, 0.05]} />
          <group ref={arm} position={[0.25, 0.46, 0.02]}>
            <mesh geometry={g.capsule} material={m.stem} position={[0, -0.12, 0]} scale={[0.05, 0.065, 0.05]} />
          </group>
          {/* 衣著與小道具 */}
          {has('shawl') && (
            <>
              <mesh geometry={g.cone} material={m.accent} position={[0, 0.06 + stemH * 0.5, 0]} scale={[stemR * 1.35, 0.2, stemR * 1.35]} />
              {[0, 1, 2, 3].map((i) => (
                <mesh key={i} geometry={g.lowSphere} material={toon(['#f2a7c8', '#ffd86b', '#ffffff', '#8de6be'][i]!)} position={[Math.cos(i * 1.5) * 0.24, 0.06 + stemH * 0.45, Math.sin(i * 1.5) * 0.22 + 0.04]} scale={0.03} />
              ))}
            </>
          )}
          {has('cane') && (
            <group position={[-0.33, 0, 0.12]}>
              <mesh geometry={g.cylinder} material={m.wood} position={[0, 0.3, 0]} scale={[0.022, 0.6, 0.022]} />
              <mesh geometry={g.torus} material={m.wood} position={[0.05, 0.6, 0]} rotation={[0, 0, 0]} scale={[0.05, 0.05, 0.08]} />
            </group>
          )}
          {has('apron') && <mesh geometry={g.box} material={m.accent} position={[0, 0.25, stemR * 1.02]} rotation={[0.05, 0, 0]} scale={[0.3, 0.32, 0.02]} />}
          {has('basket') && (
            <group position={[-0.32, 0.22, 0.1]}>
              <mesh geometry={g.cylinder} material={m.wood} scale={[0.11, 0.1, 0.11]} />
              <mesh geometry={g.lowSphere} material={glow('#8de6be', 1.4)} position={[0, 0.05, 0]} scale={[0.09, 0.04, 0.09]} />
              <mesh geometry={g.torus} material={m.wood} position={[0, 0.1, 0]} rotation={[0, Math.PI / 2, 0]} scale={[0.1, 0.1, 0.06]} />
            </group>
          )}
          {has('scarf') && <mesh geometry={g.torus} material={m.accent} position={[0, 0.06 + stemH * 0.52, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[stemR * 0.98, stemR * 0.98, 0.3]} />}
          {has('lantern') && (
            <group position={[-0.33, 0.16, 0.12]}>
              <mesh geometry={g.cylinder} material={m.dark} position={[0, 0.2, 0]} scale={[0.01, 0.16, 0.01]} />
              <mesh geometry={g.box} material={m.dark} scale={[0.1, 0.13, 0.1]} />
              <mesh geometry={g.lowSphere} material={m.lamp} scale={[0.05, 0.06, 0.05]} />
            </group>
          )}
          {/* 菌傘：半球、下方菌褶、斑點 */}
          <group ref={cap} position={[0, 0.06 + stemH - 0.02, 0]}>
            <mesh geometry={g.dome} material={m.cap} scale={[capR, capR * look.capHeight, capR]} castShadow />
            <mesh geometry={g.disc} material={m.gills} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.005, 0]} scale={capR * 0.98} />
            {SPOTS.map(([a, r], i) => {
              const rr = r * capR * 0.85;
              const y = Math.sqrt(Math.max(0, 1 - (rr / capR) ** 2)) * capR * look.capHeight;
              return <mesh key={i} geometry={g.lowSphere} material={m.spot} position={[Math.cos(a) * rr, y, Math.sin(a) * rr]} scale={[capR * 0.16, capR * 0.05, capR * 0.16]} />;
            })}
            {has('leaf') && <mesh geometry={g.lowSphere} material={m.leaf} position={[0.04, capR * look.capHeight + 0.03, 0]} rotation={[0, 0, 0.5]} scale={[0.09, 0.025, 0.05]} />}
            {kind === 'granny' && <mesh geometry={g.lowSphere} material={m.moss} position={[-capR * 0.4, capR * look.capHeight * 0.75, -capR * 0.3]} scale={[0.1, 0.04, 0.08]} />}
          </group>
        </group>
      </group>
    </group>
  );
}
