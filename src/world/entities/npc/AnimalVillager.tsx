import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { currentScreen } from '@/game/state/gameStore';
import { patchMist } from '@/render/mist';
import { toonGradient } from '@/render/toon';

/**
 * 動物居民（任務 7P，Bible §4.3–4.6、§21.1–21.2）：取代暫用的 KayKit 人形。所有居民共用一套簡單的身體（圓身體、圓頭、短手短腳），
 * 依物種換耳朵、口鼻、尾巴與花紋，再依角色加上衣著與小道具。沒有骨架：待機時呼吸、耳朵抽動，說話時揮手。
 * 原點在腳底，面向 +Z；身高約 0.8–1.4 m（依角色）。
 */
export type VillagerKind = 'mira' | 'bomu' | 'linna' | 'kiki' | 'niko' | 'tao' | 'eve';

type Species = 'rabbit' | 'bear' | 'deer' | 'tanuki' | 'hedgehog' | 'otter';
type Look = {
  species: Species;
  /** 整體縮放（基本身高約 1.1 m） */
  size: number;
  fur: string;
  /** 臉、肚子、口鼻的淺色 */
  light: string;
  /** 衣服（身體下半部） */
  cloth: string;
  accent: string;
  /** 角色的小道具 */
  props: ('scarf' | 'clipboard' | 'belt' | 'vest' | 'hammer' | 'shawl' | 'satchel' | 'vial' | 'goggles' | 'gloves' | 'mailbag' | 'hat' | 'apron' | 'seedpouch' | 'headscarf' | 'driftwood')[];
};

const LOOKS: Record<VillagerKind, Look> = {
  // 米菈：兔族村長，奶油棕毛色、長耳、藍綠圍巾、記錄板和工具腰包
  mira: { species: 'rabbit', size: 1, fur: '#c99f78', light: '#f1e2c8', cloth: '#7a5a3e', accent: '#3fa6a0', props: ['scarf', 'clipboard', 'belt'] },
  // 波木：熊族木匠，圓壯身形、棕色毛皮、橘色工作背心、木槌與工具帶
  bomu: { species: 'bear', size: 1.25, fur: '#8a5a3a', light: '#c9a07a', cloth: '#6b4a35', accent: '#e8823a', props: ['vest', 'hammer', 'belt'] },
  // 琳娜：鹿族草藥師，淡奶茶色毛皮、花草披肩、藥草包、小玻璃瓶
  linna: { species: 'deer', size: 1.1, fur: '#d8b48c', light: '#f3e6d0', cloth: '#6f8a5a', accent: '#a8c878', props: ['shawl', 'satchel', 'vial'] },
  // 奇奇：狸貓發明家，深灰與奶油色臉紋、護目鏡、工具腰包、過大的手套
  kiki: { species: 'tanuki', size: 0.9, fur: '#6b6460', light: '#efe2c8', cloth: '#4f6a7a', accent: '#d8a040', props: ['goggles', 'belt', 'gloves'] },
  // 尼可：刺蝟郵差，焦糖色刺、薄荷綠郵差包、比身體大一點的信筒
  niko: { species: 'hedgehog', size: 0.75, fur: '#a8703f', light: '#f1dcc0', cloth: '#5a7a8a', accent: '#7fd6b8', props: ['mailbag'] },
  // 桃樂：兔族園丁，奶油白、寬草帽、花種腰包、沾泥圍裙
  tao: { species: 'rabbit', size: 0.95, fur: '#f4ead8', light: '#ffffff', cloth: '#a8c0d8', accent: '#e8c46a', props: ['hat', 'apron', 'seedpouch'] },
  // 伊芙（任務 9C，Bible §21.5）：水獺族的木船修理師，藍色頭巾、修補工具腰包、小型浮木腰包
  eve: { species: 'otter', size: 1, fur: '#8a6248', light: '#e8d2b4', cloth: '#5f7f6a', accent: '#3f7fc0', props: ['headscarf', 'belt', 'driftwood', 'hammer'] },
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
const eyeMaterial = new THREE.MeshBasicMaterial({ color: '#1f1a24' });
const shineMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });

let geometry: Record<string, THREE.BufferGeometry> | null = null;
function geo() {
  geometry ??= {
    sphere: new THREE.SphereGeometry(1, 18, 14),
    lowSphere: new THREE.SphereGeometry(1, 10, 8),
    capsule: new THREE.CapsuleGeometry(1, 2, 4, 10),
    cone: new THREE.ConeGeometry(1, 1, 8),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 16),
    box: new THREE.BoxGeometry(1, 1, 1),
    torus: new THREE.TorusGeometry(1, 0.25, 8, 20),
  };
  return geometry;
}

export function AnimalVillager({ kind, talking }: { kind: VillagerKind; talking: () => boolean }) {
  const look = LOOKS[kind];
  const g = geo();
  const m = useMemo(
    () => ({ fur: toon(look.fur), light: toon(look.light), cloth: toon(look.cloth), accent: toon(look.accent), dark: toon('#3a2f2a'), wood: toon('#8a5a33'), paper: toon('#f6eedb'), metal: toon('#9a9aa0'), glass: toon('#9fe0e8') }),
    [look],
  );
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const ears = useRef<THREE.Group>(null);
  const arm = useRef<THREE.Group>(null);
  // 每個角色的待機動作錯開一點（不用亂數：渲染時不能呼叫不純的函式）
  const local = useMemo(() => ({ time: kind.length * 1.7, talk: 0 }), [kind]);
  useFrame((_, rawDt) => {
    if (currentScreen() === 'paused') return;
    const dt = Math.min(rawDt, 1 / 20);
    local.time += dt;
    local.talk = talking() ? local.talk + dt : 0;
    const t = local.time;
    const breathe = 1 + Math.sin(t * 2) * 0.02;
    body.current?.scale.set(1, breathe, 1);
    if (head.current) head.current.rotation.set(Math.sin(t * 0.7) * 0.04, Math.sin(t * 0.45) * 0.12, Math.sin(t * 0.9) * 0.03);
    if (ears.current) ears.current.rotation.x = Math.sin(t * 1.3) > 0.96 ? -0.25 : 0;
    // 說話時揮手
    if (arm.current) arm.current.rotation.z = local.talk > 0 ? -1.6 - Math.sin(local.talk * 9) * 0.35 : -0.15;
  });

  const s = look.size;
  const has = (p: Look['props'][number]) => look.props.includes(p);
  const headY = 0.86;
  return (
    <group scale={s}>
      {/* 腳 */}
      {[-1, 1].map((side) => (
        <mesh key={side} geometry={g.lowSphere} material={look.species === 'bear' ? m.fur : m.dark} position={[side * 0.11, 0.05, 0.04]} scale={[0.09, 0.06, 0.13]} />
      ))}
      <group ref={body}>
        {/* 身體：下半部是衣服，上半部是毛（肚子淺色） */}
        <mesh geometry={g.sphere} material={m.cloth} position={[0, 0.32, 0]} scale={[0.3, 0.3, 0.27]} castShadow />
        <mesh geometry={g.sphere} material={m.fur} position={[0, 0.52, 0]} scale={[0.25, 0.22, 0.23]} castShadow />
        <mesh geometry={g.sphere} material={m.light} position={[0, 0.5, 0.12]} scale={[0.15, 0.15, 0.12]} />
        {/* 手：左手垂下，右手說話時揮 */}
        <mesh geometry={g.capsule} material={m.fur} position={[-0.29, 0.45, 0.02]} rotation={[0, 0, 0.25]} scale={[0.055, 0.07, 0.055]} />
        <group ref={arm} position={[0.27, 0.56, 0.02]}>
          <mesh geometry={g.capsule} material={m.fur} position={[0, -0.12, 0]} scale={[0.055, 0.07, 0.055]} />
          {has('gloves') && <mesh geometry={g.sphere} material={m.accent} position={[0, -0.25, 0]} scale={0.08} />}
          {has('hammer') && (
            <group position={[0, -0.24, 0.05]}>
              <mesh geometry={g.cylinder} material={m.wood} scale={[0.018, 0.3, 0.018]} position={[0, -0.08, 0]} />
              <mesh geometry={g.box} material={m.wood} scale={[0.14, 0.07, 0.07]} position={[0, -0.24, 0]} />
            </group>
          )}
        </group>
        {has('gloves') && <mesh geometry={g.sphere} material={m.accent} position={[-0.33, 0.27, 0.03]} scale={0.08} />}
        {/* 衣著與小道具 */}
        {has('vest') && <mesh geometry={g.cylinder} material={m.accent} position={[0, 0.5, 0]} scale={[0.255, 0.18, 0.235]} />}
        {has('apron') && <mesh geometry={g.box} material={m.accent} position={[0, 0.3, 0.24]} rotation={[0.1, 0, 0]} scale={[0.26, 0.3, 0.02]} />}
        {has('belt') && <mesh geometry={g.torus} material={m.dark} position={[0, 0.4, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.29, 0.27, 0.08]} />}
        {has('belt') && <mesh geometry={g.box} material={m.accent} position={[0.2, 0.38, 0.17]} scale={[0.08, 0.07, 0.04]} />}
        {has('scarf') && <mesh geometry={g.torus} material={m.accent} position={[0, 0.7, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.19, 0.18, 0.35]} />}
        {has('shawl') && <mesh geometry={g.cone} material={m.accent} position={[0, 0.62, 0]} scale={[0.3, 0.2, 0.28]} />}
        {has('shawl') && [0, 1, 2, 3].map((i) => <mesh key={i} geometry={g.lowSphere} material={toon(['#f2a7c8', '#ffd86b', '#ffffff', '#b9a2e6'][i]!)} position={[Math.cos(i * 1.6) * 0.22, 0.62, Math.sin(i * 1.6) * 0.2 + 0.05]} scale={0.03} />)}
        {has('clipboard') && (
          <group position={[-0.24, 0.42, 0.18]} rotation={[0.3, 0.4, 0.2]}>
            <mesh geometry={g.box} material={m.wood} scale={[0.14, 0.18, 0.015]} />
            <mesh geometry={g.box} material={m.paper} position={[0, -0.01, 0.01]} scale={[0.11, 0.14, 0.01]} />
          </group>
        )}
        {(has('satchel') || has('seedpouch')) && <mesh geometry={g.box} material={has('seedpouch') ? m.cloth : m.wood} position={[-0.25, 0.34, 0.08]} scale={[0.1, 0.12, 0.08]} />}
        {has('vial') && <mesh geometry={g.cylinder} material={m.glass} position={[-0.25, 0.43, 0.12]} scale={[0.025, 0.07, 0.025]} />}
        {has('mailbag') && (
          <>
            <mesh geometry={g.torus} material={m.accent} position={[0, 0.5, 0]} rotation={[0, 0, 0.7]} scale={[0.27, 0.27, 0.15]} />
            <mesh geometry={g.box} material={m.accent} position={[0.24, 0.3, 0.06]} scale={[0.16, 0.16, 0.12]} />
            {/* 比身體大一點的信筒：背在背上 */}
            <mesh geometry={g.cylinder} material={toon('#c8483a')} position={[0, 0.55, -0.26]} rotation={[0.2, 0, 0]} scale={[0.1, 0.42, 0.1]} />
          </>
        )}
        {look.species === 'hedgehog' &&
          Array.from({ length: 16 }, (_, i) => {
            const a = (i / 16) * Math.PI * 2;
            const y = 0.45 + (i % 4) * 0.08;
            return <mesh key={i} geometry={g.cone} material={m.fur} position={[Math.sin(a) * 0.22, y, Math.cos(a) * 0.2 - 0.08]} rotation={[-0.9 * Math.cos(a), 0, 0.9 * Math.sin(a)]} scale={[0.05, 0.16, 0.05]} />;
          })}
        {/* 尾巴 */}
        {look.species === 'rabbit' && <mesh geometry={g.lowSphere} material={m.light} position={[0, 0.3, -0.29]} scale={0.07} />}
        {look.species === 'deer' && <mesh geometry={g.lowSphere} material={m.light} position={[0, 0.38, -0.27]} scale={[0.05, 0.08, 0.04]} />}
        {look.species === 'otter' && <mesh geometry={g.capsule} material={m.fur} position={[0, 0.16, -0.36]} rotation={[1.25, 0, 0]} scale={[0.07, 0.11, 0.045]} />}
        {has('driftwood') && <mesh geometry={g.box} material={m.wood} position={[-0.24, 0.36, 0.1]} rotation={[0, 0.3, 0.4]} scale={[0.07, 0.16, 0.06]} />}
        {/* 小鹿背上的白色斑點 */}
        {look.species === 'deer' &&
          [
            [-0.12, 0.6, -0.18],
            [0.1, 0.56, -0.2],
            [0.0, 0.66, -0.16],
            [-0.05, 0.5, -0.22],
            [0.15, 0.64, -0.12],
          ].map(([x, y, z], i) => <mesh key={i} geometry={g.lowSphere} material={m.light} position={[x!, y!, z!]} scale={0.025} />)}
        {look.species === 'tanuki' && (
          <group position={[0, 0.25, -0.3]} rotation={[-0.6, 0, 0]}>
            {[0, 1, 2].map((i) => (
              <mesh key={i} geometry={g.lowSphere} material={i % 2 ? m.dark : m.fur} position={[0, -i * 0.07, 0]} scale={[0.08 - i * 0.008, 0.05, 0.08 - i * 0.008]} />
            ))}
          </group>
        )}
        {/* 頭 */}
        <group ref={head} position={[0, headY, 0]}>
          <mesh geometry={g.sphere} material={m.fur} scale={[0.21, 0.19, 0.2]} castShadow />
          {/* 臉與口鼻 */}
          <mesh geometry={g.sphere} material={m.light} position={[0, -0.05, 0.14]} scale={look.species === 'hedgehog' ? [0.08, 0.07, 0.12] : look.species === 'deer' ? [0.09, 0.07, 0.1] : [0.11, 0.08, 0.08]} />
          <mesh geometry={g.lowSphere} material={m.dark} position={[0, -0.02, look.species === 'hedgehog' ? 0.27 : 0.22]} scale={0.025} />
          {/* 水獺的鬍鬚 */}
          {look.species === 'otter' &&
            [-1, 1].flatMap((side) => [0, 1].map((k) => <mesh key={`${side}${k}`} geometry={g.cylinder} material={m.dark} position={[side * 0.1, -0.04 - k * 0.02, 0.2]} rotation={[0, 0, side * (1.45 + k * 0.15)]} scale={[0.004, 0.09, 0.004]} />))}
          {look.species === 'tanuki' &&
            [-1, 1].map((side) => <mesh key={side} geometry={g.lowSphere} material={m.dark} position={[side * 0.08, 0.03, 0.15]} scale={[0.065, 0.045, 0.04]} />)}
          {[-1, 1].map((side) => (
            <group key={side} position={[side * 0.075, 0.035, 0.175]}>
              <mesh geometry={g.lowSphere} material={eyeMaterial} scale={[0.025, 0.032, 0.015]} />
              <mesh geometry={g.lowSphere} material={shineMaterial} position={[0.008, 0.012, 0.01]} scale={0.008} />
            </group>
          ))}
          {/* 耳朵 */}
          <group ref={ears}>
            {[-1, 1].map((side) => {
              if (look.species === 'rabbit') return <mesh key={side} geometry={g.capsule} material={m.fur} position={[side * 0.08, 0.27, -0.02]} rotation={[0, 0, side * 0.18]} scale={[0.045, 0.1, 0.03]} />;
              if (look.species === 'deer')
                return (
                  <group key={side}>
                    <mesh geometry={g.lowSphere} material={m.fur} position={[side * 0.2, 0.14, -0.02]} rotation={[0, 0, side * 0.75]} scale={[0.05, 0.12, 0.025]} />
                    <mesh geometry={g.lowSphere} material={m.light} position={[side * 0.205, 0.14, 0.0]} rotation={[0, 0, side * 0.75]} scale={[0.03, 0.08, 0.01]} />
                  </group>
                );
              if (look.species === 'hedgehog') return <mesh key={side} geometry={g.lowSphere} material={m.light} position={[side * 0.12, 0.13, 0.02]} scale={0.035} />;
              if (look.species === 'otter') return <mesh key={side} geometry={g.lowSphere} material={m.fur} position={[side * 0.17, 0.08, -0.02]} scale={[0.035, 0.035, 0.025]} />;
              return <mesh key={side} geometry={g.lowSphere} material={look.species === 'tanuki' ? m.dark : m.fur} position={[side * 0.13, 0.15, -0.02]} scale={[0.06, 0.06, 0.03]} />;
            })}
          </group>
          {/* 刺蝟：頭頂到後腦一圈刺，從正面也看得到 */}
          {look.species === 'hedgehog' &&
            Array.from({ length: 11 }, (_, i) => {
              const a = -Math.PI * 0.85 + (i / 10) * Math.PI * 1.7;
              return <mesh key={i} geometry={g.cone} material={m.fur} position={[Math.sin(a) * 0.17, 0.12 + Math.cos(a) * 0.05, -0.02 - Math.abs(Math.cos(a)) * 0.04]} rotation={[-0.5, 0, -Math.sin(a) * 1.1]} scale={[0.045, 0.15, 0.045]} />;
            })}
          {has('headscarf') && (
            <>
              <mesh geometry={g.sphere} material={m.accent} position={[0, 0.07, -0.01]} scale={[0.215, 0.13, 0.205]} />
              <mesh geometry={g.lowSphere} material={m.accent} position={[0.06, 0.04, -0.21]} scale={[0.05, 0.035, 0.05]} />
              <mesh geometry={g.capsule} material={m.accent} position={[0.09, -0.03, -0.24]} rotation={[0.6, 0, 0.4]} scale={[0.025, 0.035, 0.015]} />
            </>
          )}
          {has('goggles') && [-1, 1].map((side) => <mesh key={side} geometry={g.torus} material={m.accent} position={[side * 0.07, 0.13, 0.15]} rotation={[-0.4, 0, 0]} scale={0.04} />)}
          {has('hat') && (
            <group position={[0, 0.14, 0]}>
              <mesh geometry={g.cylinder} material={m.accent} scale={[0.32, 0.015, 0.32]} />
              <mesh geometry={g.cylinder} material={m.accent} position={[0, 0.06, 0]} scale={[0.15, 0.12, 0.15]} />
              <mesh geometry={g.cylinder} material={toon('#d86a6a')} position={[0, 0.03, 0]} scale={[0.155, 0.03, 0.155]} />
            </group>
          )}
        </group>
      </group>
    </group>
  );
}
