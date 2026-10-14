import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { currentScreen } from '@/game/state/gameStore';
import { patchMist } from '@/render/mist';
import { toonGradient } from '@/render/toon';

/**
 * 奧林（任務 7M，Bible §4.7）：貓頭鷹族史學家。圓眼、米白羽毛、深藍長袍、腰間掛著舊羅盤。
 * 待機時偶爾歪頭、眨眼；說話時翅膀抬一下。原點在腳底，約 1.1 m 高。
 */
let shared: Record<'feather' | 'robe' | 'face' | 'eye' | 'pupil' | 'beak' | 'brass', THREE.Material> | null = null;
function materials() {
  const toon = (color: string) => patchMist(new THREE.MeshToonMaterial({ gradientMap: toonGradient(), color }));
  shared ??= {
    feather: toon('#e9dcc2'),
    robe: toon('#2f4a7a'),
    face: toon('#f6efe0'),
    eye: new THREE.MeshBasicMaterial({ color: '#f2c14e' }),
    pupil: new THREE.MeshBasicMaterial({ color: '#1f1a24' }),
    beak: toon('#c9922f'),
    brass: toon('#b8893a'),
  };
  return shared;
}

export function OwlScholar({ talking }: { talking: () => boolean }) {
  const m = materials();
  const geo = useMemo(
    () => ({
      body: new THREE.SphereGeometry(0.34, 18, 14),
      robe: new THREE.CylinderGeometry(0.3, 0.42, 0.62, 18),
      head: new THREE.SphereGeometry(0.27, 18, 14),
      disc: new THREE.CircleGeometry(0.11, 16),
      eye: new THREE.SphereGeometry(0.075, 12, 10),
      pupil: new THREE.SphereGeometry(0.035, 10, 8),
      beak: new THREE.ConeGeometry(0.04, 0.1, 6),
      tuft: new THREE.ConeGeometry(0.05, 0.14, 6),
      wing: new THREE.SphereGeometry(0.16, 12, 10),
      compass: new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12),
      foot: new THREE.SphereGeometry(0.06, 8, 6),
    }),
    [],
  );
  const head = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const wings = useRef<THREE.Group>(null);
  const local = useMemo(() => ({ time: 0, talk: 0 }), []);
  useFrame((_, rawDt) => {
    if (currentScreen() === 'paused') return;
    const dt = Math.min(rawDt, 1 / 20);
    local.time += dt;
    local.talk = talking() ? local.talk + dt : 0;
    const t = local.time;
    if (head.current) head.current.rotation.z = Math.sin(t * 0.6) > 0.9 ? 0.25 : Math.sin(t * 1.1) * 0.03;
    if (eyes.current) eyes.current.scale.y = Math.sin(t * 0.8) > 0.985 ? 0.15 : 1;
    if (wings.current) wings.current.rotation.z = local.talk > 0 ? Math.abs(Math.sin(local.talk * 4)) * 0.4 : 0;
  });
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={geo.foot} material={m.beak} position={[s * 0.12, 0.03, 0.08]} scale={[1, 0.5, 1.4]} />
      ))}
      <mesh geometry={geo.robe} material={m.robe} position={[0, 0.33, 0]} castShadow />
      <mesh geometry={geo.body} material={m.feather} position={[0, 0.62, 0]} scale={[1, 0.9, 0.95]} castShadow />
      <mesh geometry={geo.compass} material={m.brass} position={[0.2, 0.42, 0.3]} rotation={[1.2, 0, 0]} />
      <group ref={wings}>
        {[-1, 1].map((s) => (
          <mesh key={s} geometry={geo.wing} material={m.robe} position={[s * 0.33, 0.6, 0]} scale={[0.5, 1.2, 0.9]} />
        ))}
      </group>
      <group ref={head} position={[0, 0.95, 0]}>
        <mesh geometry={geo.head} material={m.feather} castShadow />
        {[-1, 1].map((s) => (
          <group key={s}>
            <mesh geometry={geo.disc} material={m.face} position={[s * 0.1, 0.02, 0.245]} />
            <mesh geometry={geo.tuft} material={m.feather} position={[s * 0.17, 0.25, 0]} rotation={[0, 0, -s * 0.4]} />
          </group>
        ))}
        <group ref={eyes}>
          {[-1, 1].map((s) => (
            <group key={s} position={[s * 0.1, 0.02, 0.25]}>
              <mesh geometry={geo.eye} material={m.eye} scale={[1, 1, 0.4]} />
              <mesh geometry={geo.pupil} material={m.pupil} position={[0, 0, 0.03]} />
            </group>
          ))}
        </group>
        <mesh geometry={geo.beak} material={m.beak} position={[0, -0.07, 0.27]} rotation={[Math.PI / 2 + 0.3, 0, 0]} />
      </group>
    </group>
  );
}
