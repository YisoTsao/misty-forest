import { useFrame } from '@react-three/fiber';
import { useRef, type ReactNode } from 'react';
import type * as THREE from 'three';
import { OVERWORLD } from '@/game-core/world/interiors';
import type { MapId } from '@/game-core/world/maps';
import { interiors } from '@/game/authority';
import { useLocationStore } from '@/game/location';

/**
 * 只在開放世界顯示的東西（天空、遠山、地形、草、湖面）：在室內子場景時隱藏（規格 5.1：子場景不與開放世界混用）。
 * 以 visible 切換、不卸載，回到戶外時不必重建草叢等資源。物理（地形碰撞）不受影響。
 */
export function OutdoorOnly({ children }: { children: ReactNode }) {
  const outdoor = useLocationStore((s) => s.location === OVERWORLD);
  return <group visible={outdoor}>{children}</group>;
}

/**
 * 只在某張地圖顯示的東西（任務 8A：地形、草、湖面、遠景）：所有地圖在同一個物理世界，
 * 不在這張地圖時整組隱藏（不卸載，碰撞仍在；回來時不必重建）。室內時也隱藏。
 */
export function MapOnly({ map, children }: { map: MapId; children: ReactNode }) {
  const shown = useLocationStore((s) => s.location === OVERWORLD && s.map === map);
  return <group visible={shown}>{children}</group>;
}

/** 室內的暖光（壁爐），隨火光輕微閃爍 */
export function InteriorLights() {
  const location = useLocationStore((s) => s.location);
  const interior = interiors.get(location);
  const light = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    if (light.current) light.current.intensity = 9 + Math.sin(clock.elapsedTime * 9) * 0.8 + Math.sin(clock.elapsedTime * 13.7) * 0.6;
  });
  if (!interior) return null;
  return (
    <>
      <pointLight ref={light} position={interior.light} color="#ffb565" intensity={9} distance={14} decay={1.6} />
      <pointLight position={[interior.origin[0] - 2, 3.4, interior.origin[1] + 1]} color="#ffe3b8" intensity={3} distance={10} decay={1.6} />
    </>
  );
}
