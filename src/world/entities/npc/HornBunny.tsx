import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { currentScreen } from '@/game/state/gameStore';
import { patchMist } from '@/render/mist';
import { toonGradient } from '@/render/toon';

/**
 * 角兔幼崽（任務 7L，Bible §22.1 quest_dawn_006）：奶油色的小兔子，額頭一根小小的角。完成「河邊的腳印」後住在河邊。
 * 待機時抽動耳朵、偶爾低頭啃東西；說話時跳一下。原點在腳底，約 0.45 m 高。
 */
let shared: { body: THREE.Material; dark: THREE.Material; pink: THREE.Material; horn: THREE.Material } | null = null;
function materials() {
  shared ??= {
    body: patchMist(new THREE.MeshToonMaterial({ gradientMap: toonGradient(), color: '#f1e4c8' })),
    dark: new THREE.MeshBasicMaterial({ color: '#2b2433' }),
    pink: patchMist(new THREE.MeshToonMaterial({ gradientMap: toonGradient(), color: '#f2b8c6' })),
    horn: patchMist(new THREE.MeshToonMaterial({ gradientMap: toonGradient(), color: '#f6d98a' })),
  };
  return shared;
}

export function HornBunny({ talking }: { talking: () => boolean }) {
  const m = materials();
  const geo = useMemo(
    () => ({
      body: new THREE.SphereGeometry(0.17, 14, 10),
      head: new THREE.SphereGeometry(0.12, 14, 10),
      ear: new THREE.CapsuleGeometry(0.035, 0.16, 4, 8),
      eye: new THREE.SphereGeometry(0.022, 8, 6),
      tail: new THREE.SphereGeometry(0.05, 8, 6),
      horn: new THREE.ConeGeometry(0.025, 0.09, 6),
    }),
    [],
  );
  const root = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const ears = useRef<THREE.Group>(null);
  const local = useMemo(() => ({ time: 0, hop: 0 }), []);
  useFrame((_, rawDt) => {
    if (currentScreen() === 'paused') return;
    const dt = Math.min(rawDt, 1 / 20);
    local.time += dt;
    local.hop = talking() ? local.hop + dt : 0;
    const t = local.time;
    if (root.current) root.current.position.y = local.hop > 0 ? Math.abs(Math.sin(local.hop * 6)) * 0.18 : 0;
    // 每隔一陣子低頭啃東西
    const nibble = Math.max(0, Math.sin(t * 0.7)) > 0.85 ? Math.sin(t * 18) * 0.04 + 0.25 : 0;
    if (head.current) head.current.rotation.x = nibble;
    if (ears.current) ears.current.rotation.z = Math.sin(t * 2.3) * 0.08 + (Math.sin(t * 0.9) > 0.97 ? 0.25 : 0);
  });
  return (
    <group ref={root}>
      <mesh geometry={geo.body} material={m.body} position={[0, 0.16, -0.03]} scale={[1, 0.9, 1.2]} castShadow />
      <mesh geometry={geo.tail} material={m.body} position={[0, 0.17, -0.24]} />
      <group ref={head} position={[0, 0.3, 0.13]}>
        <mesh geometry={geo.head} material={m.body} castShadow />
        {[-1, 1].map((s) => (
          <mesh key={s} geometry={geo.eye} material={m.dark} position={[s * 0.055, 0.02, 0.1]} />
        ))}
        <mesh geometry={geo.eye} material={m.pink} position={[0, -0.03, 0.115]} scale={0.6} />
        <mesh geometry={geo.horn} material={m.horn} position={[0, 0.13, 0.05]} rotation={[0.3, 0, 0]} />
        <group ref={ears}>
          {[-1, 1].map((s) => (
            <mesh key={s} geometry={geo.ear} material={m.body} position={[s * 0.06, 0.15, -0.03]} rotation={[-0.2, 0, s * 0.25]} />
          ))}
        </group>
      </group>
    </group>
  );
}
